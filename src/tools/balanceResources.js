import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Función para balancear los recursos utilizando el héroe.
 * @param {Page} page - Instancia de Puppeteer Page.
 */
export async function balanceResources(page) {
  try {
    // Navegar a la página de atributos del héroe
    const heroAttributesUrl = `${process.env.BASE_URL}/hero/attributes`;
    await page.goto(heroAttributesUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Obtener los valores actuales de los recursos
    const resources = await getResourceValues(page);
   
    // Determinar cuál es el recurso con menor cantidad
    const resourceToGenerate = getResourceToGenerate(resources);
    
    // Seleccionar el botón correspondiente en la página de atributos del héroe
    await selectResourceButton(page, resourceToGenerate);

    console.log(`Recurso seleccionado para generación: ${resourceToGenerate}`);
  } catch (error) {
    console.error(`Error al balancear los recursos: ${error.message}`);
  }
}

/**
 * Obtiene los valores actuales de los recursos.
 * @param {Page} page - Instancia de Puppeteer Page.
 * @returns {Object} - Objeto con los valores de los recursos.
 */
async function getResourceValues(page) {
  const resources = {};

  // Obtener los valores de los recursos desde la página
  const resourceValues = await page.$$eval('.stockBarButton .value', elements => {
    return elements.map(el => {
      const value = el.textContent.replace(/[^\d]/g, ''); // Eliminar caracteres no numéricos
      return parseInt(value, 10);
    });
  });

  // Asignar los valores a cada recurso
  resources.wood = resourceValues[0];
  resources.clay = resourceValues[1];
  resources.iron = resourceValues[2];
  resources.crop = resourceValues[3];

  console.log('Recursos actuales:', resources);
  return resources;
}

/**
 * Determina cuál es el recurso con menor cantidad.
 * @param {Object} resources - Objeto con los valores de los recursos.
 * @returns {String} - Nombre del recurso a generar.
 */
function getResourceToGenerate(resources) {
  const resourceNames = ['wood', 'clay', 'iron', 'crop'];
  let minResource = resourceNames[0];

  for (const resource of resourceNames) {
    if (resources[resource] < resources[minResource]) {
      minResource = resource;
    }
  }

  console.log(`Recurso con menor cantidad: ${minResource}`);
  return minResource;
}

/**
 * Selecciona el botón correspondiente en la página de atributos del héroe.
 * @param {Page} page - Instancia de Puppeteer Page.
 * @param {String} resource - Nombre del recurso a generar.
 */
async function selectResourceButton(page, resource) {
    const buttonSelectors = {
      wood: 'button i.lumber_small', // Selecciona el botón que contiene el icono de madera
      clay: 'button i.clay_small',   // Selecciona el botón que contiene el icono de barro
      iron: 'button i.iron_small',   // Selecciona el botón que contiene el icono de hierro
      crop: 'button i.crop_small',   // Selecciona el botón que contiene el icono de cereal
    };
  
    const buttonSelector = buttonSelectors[resource];
  
    try {
      // Esperar a que el botón esté presente en el DOM
      await page.waitForSelector(buttonSelector, { timeout: 5000 });
  
      // Verificar si el botón ya está seleccionado (tiene la clase "active" en el botón padre)
      const isActive = await page.$eval(
        buttonSelector,
        (icon) => icon.closest('button').classList.contains('active')
      );
  
      if (!isActive) {
        // Hacer clic en el botón si no está activo
        await page.click(buttonSelector);
        console.log(`Botón de ${resource} seleccionado.`);
      } else {
        console.log(`El botón de ${resource} ya está seleccionado.`);
      }
    } catch (error) {
      console.error(`Error al seleccionar el botón de ${resource}: ${error.message}`);
    }
  }