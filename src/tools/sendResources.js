import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Envía recursos desde la aldea actual a una aldea destino.
 * @param {Page} page - Instancia de Puppeteer Page.
 * @param {Object} aldea - Configuración de la aldea.
 */
export async function sendResources(page, aldea, targetAldea = null) {
  // Determinar la aldea de destino
  const target = targetAldea?.ruta || aldea.task.find(task => task.name === "sendResources")?.targetVillage;

  // Normalizar la estructura de target
  let ruta;
  if (Array.isArray(target)) {
    // Si target es un array [x, y], convertirlo a un objeto { x, y }
    ruta = { x: target[0], y: target[1] };
  } else if (target && target.x !== undefined && target.y !== undefined) {
    // Si target es un objeto { x, y }, usarlo directamente
    ruta = target;
  } else {
    // Si no se encuentra una aldea de destino válida
    console.log('No se encontraron coordenadas de la aldea destino en la configuración.');
    return;
  }

  // Construir la URL del mercado con las coordenadas
  const marketUrl = `${process.env.BASE_URL}/build.php?id=20&gid=17&t=5&x=${ruta.x}&y=${ruta.y}`;


  try {
    // Navegar a la página del mercado
    await page.goto(marketUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Obtener la capacidad de los comerciantes
    const merchantCapacity = await page.$eval('.merchantCarryInfo strong', el => parseInt(el.textContent, 10)) * 1;//aumentar la cantidad por 2 para tener mas disponibilidad de materias
    const availableMerchants = await page.$eval('.available .value', el => {
      const cleanText = el.textContent.replace(/[^\d/]/g, ''); // Elimina caracteres no numéricos excepto '/'
      const [available, total] = cleanText.split('/').map(num => parseInt(num, 10));
      return { available, total };
    });

    console.log(`Comerciantes disponibles: ${availableMerchants.available}/${availableMerchants.total}`);
    console.log(`Capacidad por comerciante: ${merchantCapacity}`);

    // Ingresar las coordenadas de la aldea destino
    // await page.type('.coordinateX input', targetVillage.x.toString());
    // await page.type('.coordinateY input', targetVillage.y.toString());

    // // Esperar a que se carguen los detalles de la aldea destino
    // await page.waitForSelector('.targetWrapper .player .value', { timeout: 5000 });

    // Obtener los recursos disponibles en la aldea actual
    let resources = await page.$$eval('.resourceSelector .inputRatio .denominator', elements => {
      return elements.map(el => parseInt(el.textContent.replace(/[^\d]/g, ''), 10));
    });

    console.log('Recursos disponibles:', resources);

    // Calcular el total de recursos disponibles
    let totalResources = resources.reduce((sum, value) => sum + value, 0);

    // Determinar la cantidad máxima de comerciantes que pueden viajar completos
    let fullMerchants = Math.min(availableMerchants.available, Math.floor(totalResources / merchantCapacity));

    if (fullMerchants === 0) {
        let missingResources = merchantCapacity - (totalResources % merchantCapacity);
        console.log(`No se enviarán los recursos porque no se puede llenar al menos un comerciante.`);
        console.log(`Faltan ${missingResources} recursos para completar un comerciante.`);
        return;
    }

    // Distribuir los recursos para llenar los comerciantes en múltiplos de merchantCapacity
    let resourcesToSend = [0, 0, 0, 0];
    let remainingCapacity = fullMerchants * merchantCapacity;

    for (let i = 0; i < resources.length; i++) {
      let take = Math.min(resources[i], remainingCapacity);
      resourcesToSend[i] = take;
      remainingCapacity -= take;

      if (remainingCapacity === 0) break;
    }

    console.log(`Enviando recursos con ${fullMerchants} comerciantes:`, resourcesToSend);

    // Llenar el formulario con la cantidad de recursos a enviar
    await page.type('.resourceSelector input[name="lumber"]', resourcesToSend[0].toString());
    await page.type('.resourceSelector input[name="clay"]', resourcesToSend[1].toString());
    await page.type('.resourceSelector input[name="iron"]', resourcesToSend[2].toString());
    await page.type('.resourceSelector input[name="crop"]', resourcesToSend[3].toString());

    // Enviar los recursos
    await page.click('.actionButtons .send');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Espera 2 segundos
    console.log('Recursos enviados correctamente.');
  } catch (error) {
    console.error(`Error al enviar recursos: ${error.message}`);
  }
}
