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

  try {
    // Obtener campos según preferencia
    const preference = aldea.task.find(task => task.name === "upgradeResourceField")?.preference || [];
    const fieldsToConsider = sortByLevel(await getResourceFields(page, aldea.newdid, preference));
    
    if (fieldsToConsider.length === 0) {
      console.log("No se encontraron campos de recursos disponibles para mejorar.");
      return;
    }

    const fieldToUpgrade = fieldsToConsider[0];
    console.log(`Seleccionando el campo de recursos con el nivel más bajo: ${fieldToUpgrade.fieldId}, Nivel: ${fieldToUpgrade.level}`);

    const resourceFieldUrl = resourceFieldBaseUrl + fieldToUpgrade.fieldId;
    console.log(`Accediendo a la URL para el campo de recursos ${fieldToUpgrade.fieldId}: ${resourceFieldUrl}`);
    await page.goto(resourceFieldUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Selectores actualizados basados en el HTML proporcionado
    const upgradeButtonSelector = 'div.upgradeButtonsContainer > div.section1 > button.textButtonV1.green.build';
    const durationSelector = 'div.upgradeButtonsContainer > div.section1 > div.inlineIcon.duration > span.value';

  
    // Esperar a que el botón esté disponible y visible
    await page.waitForSelector(upgradeButtonSelector, { 
      state: 'visible', 
      timeout: 10000 
    });

    // Verificar si el botón está deshabilitado
    const isDisabled = await page.$eval(upgradeButtonSelector, button => button.disabled);
    if (isDisabled) {
      console.log("El botón está deshabilitado (otra mejora en curso).");
      return;
    }

    // Obtener el tiempo de mejora
    const durationText = await page.$eval(durationSelector, (span) => span.textContent);
    const upgradeDuration = convertToMilliseconds(durationText);

    // Hacer clic de manera más robusta
    console.log("Intentando hacer clic en el botón de mejora...");
    
    // Opción 1: Usar page.$eval para activar el click directamente
    await page.$eval(upgradeButtonSelector, button => {
      button.click(); // Dispara el evento click nativo
    });

    // Esperar un breve momento para que se procese la acción
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // // Registrar la mejora
    // const completionTime = new Date(Date.now() + upgradeDuration);
    // aldeaResourceLogData[fieldToUpgrade.fieldId] = completionTime.toISOString();
    // fs.writeFileSync(logFilePath, JSON.stringify(aldeaResourceLogData, null, 2));
    // console.log(`Campo ${fieldToUpgrade.fieldId} mejorado. Tiempo estimado: ${completionTime}`);

    
  } catch (error) {
    console.error(`Error general en upgradeResourceField: ${error.message}`);
  }
}