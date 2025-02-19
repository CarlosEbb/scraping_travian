import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Asegúrate de importar fileURLToPath

// Obtener el directorio actual usando import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sortByLevel(arr) {
  return arr.sort((a, b) => {
    const levelA = a.level === null ? 0 : a.level;
    const levelB = b.level === null ? 0 : b.level;
    return levelA - levelB;
  });
}

// Función para convertir el tiempo a milisegundos
function convertToMilliseconds(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(num => parseInt(num, 10));
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

// Función para obtener los campos de recursos de acuerdo a la preferencia
async function getResourceFields(page, newdid, preference) {
  const villageUrls = [
    { 
      url: `${process.env.BASE_URL}/dorf1.php?newdid=${newdid}&`, 
      selector: '#resourceFieldContainer a.good',
      isDorf1: true // Bandera para identificar dorf1
    },
    { 
      url: `${process.env.BASE_URL}/dorf2.php?newdid=${newdid}&`, 
      selector: '#villageContent .buildingSlot a.level.colorLayer.good',
      isDorf1: false // Bandera para identificar dorf2
    },
  ];

  let allFields = [];

  // Si no hay preferencias, solo procesamos dorf1
  if (!preference || preference.length === 0) {
    const { url, selector, isDorf1 } = villageUrls[0]; // Solo dorf1
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Lógica específica para dorf1
    const fields = await page.$$eval(selector, elements => {
      return elements.map(el => {
        const fieldId = el.getAttribute('data-aid');
        const level = parseInt(el.querySelector('.labelLayer').textContent, 10);
        return { fieldId, level };
      });
    });

    allFields = [...allFields, ...fields]; // Combinar los campos
  } else {
    // Si hay preferencias, procesamos ambas URLs
    for (const { url, selector, isDorf1 } of villageUrls) {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      let fields = [];

      if (isDorf1) {
        // Lógica específica para dorf1
        fields = await page.$$eval(selector, elements => {
          return elements.map(el => {
            const fieldId = el.getAttribute('data-aid');
            const level = parseInt(el.querySelector('.labelLayer').textContent, 10);
            return { fieldId, level };
          });
        });
      } else {
        // Lógica específica para dorf2
        fields = await page.$$eval(selector, elements => {
          return elements.map(el => {
            // Obtener el fieldId del <div> padre con la clase 'buildingSlot'
            const buildingSlot = el.closest('.buildingSlot');
            if (!buildingSlot) {
              console.warn('No se encontró un elemento padre con la clase "buildingSlot"');
              return null;
            }
            const fieldId = buildingSlot.getAttribute('data-aid');
            const level = parseInt(el.querySelector('.labelLayer').textContent, 10);
            return { fieldId, level };
          }).filter(Boolean); // Filtrar elementos nulos
        });
      }

      allFields = [...allFields, ...fields]; // Combinar los campos de ambas URLs
    }
  }

  // Si no hay preferencia, devolvemos todos los campos de dorf1
  if (!preference || preference.length === 0) {
    return allFields;
  }

  // Filtrar solo los campos que están en la preferencia
  const filteredFields = allFields.filter(field => preference.includes(field.fieldId));

  // Si todos los campos de preferencia existen, retornamos solo los campos filtrados
  return filteredFields;
}


// Función principal para mejorar el campo de recursos
export async function upgradeResourceField(page, aldea, logData) {
  const resourceFieldBaseUrl = `${process.env.BASE_URL}/build.php?newdid=${aldea.newdid}&id=`;

  const logFilePath = path.join(__dirname, '..', 'temporal', `log_${aldea.name}_resources.json`);
  let aldeaResourceLogData = {};

  // Leer o crear el log de recursos
  if (fs.existsSync(logFilePath)) {
    aldeaResourceLogData = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
  } else {
    fs.writeFileSync(logFilePath, JSON.stringify({}, null, 2));
  }

  // Verificar si ya hay un campo de recursos en progreso
  const inProgress = Object.values(aldeaResourceLogData).some(time => new Date(time) > new Date());
  if (inProgress) {
    console.log("Hay una mejora en progreso. Esperando...");
    return; // Si hay una mejora en progreso, terminamos la ejecución
  }

  try {
    // Si se define la propiedad 'preference' en la aldea, solo mejoramos los campos indicados en esa lista
    const preference = aldea.task.find(task => task.name === "upgradeResourceField")?.preference || [];
    const fieldsToConsider = sortByLevel(await getResourceFields(page, aldea.newdid, preference));
    console.log("Campos Encontrados",fieldsToConsider);
    if (fieldsToConsider.length === 0) {
      console.log("No se encontraron campos de recursos disponibles para mejorar.");
      return;
    }

    // Seleccionamos el campo con el nivel más bajo dentro de los campos de preferencia
    const fieldToUpgrade = fieldsToConsider[0];
    console.log(fieldsToConsider);
    console.log(`Seleccionando el campo de recursos con el nivel más bajo: ${fieldToUpgrade.fieldId}, Nivel: ${fieldToUpgrade.level}`);

    const resourceFieldUrl = resourceFieldBaseUrl + fieldToUpgrade.fieldId;
    console.log(`Accediendo a la URL para el campo de recursos ${fieldToUpgrade.fieldId}: ${resourceFieldUrl}`);
    await page.goto(resourceFieldUrl, { timeout: 60000 });

    // Selector para el botón de mejora y el de "Construir con el ingeniero maestro"
    const upgradeButtonSelector = `button[value*='Mejora al nivel']`;
    const engineerButtonSelector = `button[value*='Construir con el ingeniero maestro']`;
    const durationSelector = '.inlineIcon.duration span.value';

    try {
      // Intentar esperar por el botón de mejora
      await page.waitForSelector(upgradeButtonSelector, { timeout: 10000 });
      const upgradeButton = await page.$(upgradeButtonSelector);

      if (upgradeButton) {
        console.log(`Botón de mejora disponible para el campo ${fieldToUpgrade.fieldId}. Ejecutando acción...`);

        // Obtener el tiempo de mejora
        const durationText = await page.$eval(durationSelector, (span) => span.textContent);
        const upgradeDuration = convertToMilliseconds(durationText);

        const currentTime = new Date();
        const completionTime = new Date(currentTime.getTime() + upgradeDuration);

        // Hacer clic en el botón de mejora
        await page.click(upgradeButtonSelector);

        console.log(`Campo ${fieldToUpgrade.fieldId} mejorado. Tiempo estimado de finalización: ${completionTime}`);

        // Guardar en el log
        aldeaResourceLogData[fieldToUpgrade.fieldId] = completionTime.toISOString();
        fs.writeFileSync(logFilePath, JSON.stringify(aldeaResourceLogData, null, 2));

        console.log(`Log actualizado para el campo ${fieldToUpgrade.fieldId}`);
      }
    } catch (error) {
      // Si no se encuentra el botón de mejora, verificar el botón del ingeniero maestro
      try {
        await page.waitForSelector(engineerButtonSelector, { timeout: 5000 });
        const engineerButton = await page.$(engineerButtonSelector);

        if (engineerButton) {
          console.log(`Mejora en progreso para el campo ${fieldToUpgrade.fieldId}, no se puede ejecutar la mejora aún.`);
        } else {
          console.log(`No se pudo encontrar ni el botón de mejora ni el del ingeniero maestro para el campo ${fieldToUpgrade.fieldId}.`);
        }
      } catch (engineerError) {
        console.log(`Error al procesar el botón del ingeniero maestro para el campo ${fieldToUpgrade.fieldId}: ${engineerError.message}`);
      }
    }
  } catch (error) {
    console.error(`Error al acceder a la URL del campo de recursos: ${error.message}`);
  }
}
