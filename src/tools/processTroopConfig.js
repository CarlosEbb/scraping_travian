import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual usando import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cambiar la ruta de la carpeta 'temporal' para que esté en el directorio raíz
const temporalDir = path.join(__dirname, '..', 'temporal');

// Ruta del archivo de lista negra
const blacklistFilePath = path.join(temporalDir, 'blacklist.json');

// Verificar si la carpeta 'temporal' existe, si no, crearla
if (!fs.existsSync(temporalDir)) {
  fs.mkdirSync(temporalDir, { recursive: true });
  console.log("Carpeta 'temporal' creada.");
}

// Función para obtener la primera tropa disponible que cumpla con la cantidad requerida
async function getAllAvailableTroops(page, requiredAmount) {
  const troopTypes = ['t1', 't2', 't3', 't5', 't6']; // Tipos de tropa

  // Extraer todos los datos de las tropas en una sola corrida
  const troopsData = await page.$$eval('input[name^="troop[t"]', (inputs) => {
    return inputs.map(input => {
      const troopType = input.name.match(/troop\[(t\d+)\]/)[1]; // Extraer el tipo de tropa (t1, t2, etc.)
      const availableElement = input.parentElement?.querySelector('a, span.none'); // Buscar el elemento con la cantidad
      const availableText = availableElement?.textContent.trim() || '0'; // Extraer el texto
      const availableMatch = availableText.match(/\d+/); // Extraer el número de tropas disponibles
      const availableCount = availableMatch ? parseInt(availableMatch[0], 10) : 0; // Convertir a número

      return { troopType, availableCount };
    });
  });

  // Convertir los datos a un objeto para facilitar el acceso
  const troopsAvailable = troopsData.reduce((acc, { troopType, availableCount }) => {
    acc[troopType] = availableCount;
    return acc;
  }, {});

  console.log("Tropas disponibles:", troopsAvailable);

  // Seleccionar la primera tropa disponible que cumpla con la cantidad requerida
  for (const troopType of troopTypes) {
    const availableCount = troopsAvailable[troopType] || 0;

    if (availableCount >= requiredAmount) {
      console.log(`Seleccionando tropas de tipo ${troopType}: ${availableCount} disponibles (requeridas: ${requiredAmount})`);
      return { troopType, availableCount };
    } else if (availableCount > 0) {
      console.log(`Tropas de tipo ${troopType} insuficientes: ${availableCount} disponibles (requeridas: ${requiredAmount})`);
    }
  }

  console.log("No hay tropas disponibles que cumplan con la cantidad requerida.");
  return null; // Retornar null si no hay tropas disponibles
}

// Función para leer el archivo JSON de aldeas inactivas
function readInactiveVillagesFile() {
  const inactiveVillagesFilePath = path.join(temporalDir, 'inactive_villages.json');
  if (fs.existsSync(inactiveVillagesFilePath)) {
    return JSON.parse(fs.readFileSync(inactiveVillagesFilePath, 'utf8'));
  }
  return [];
}


// Función para calcular la cantidad de tropas según la población
function calculateTroopAmount(population) {
  if (population <= 20) {
    return 10; // Siempre enviar 10 tropas si la población es <= 10
  }
  return Math.floor(population / 2); // Enviar la mitad de la población para poblaciones mayores
}


// Función para capturar el tiempo de llegada de las tropas
async function captureArrivalTime(page) {
  const arrivalTimeSelector = '#in';
  await page.waitForSelector(arrivalTimeSelector, { timeout: 10000 });
  const arrivalTime = await page.$eval(arrivalTimeSelector, el => el.textContent.trim());
  return arrivalTime;
}

// Función para convertir el tiempo de llegada a milisegundos
function parseTimeInterval(timeString) {
  // Extraer las horas, minutos y segundos del formato "En X:XX:XX horas"
  const timeParts = timeString.match(/(\d+):(\d+):(\d+)/);
  if (!timeParts) {
    console.error(`Formato de tiempo no válido: ${timeString}`);
    return 0;
  }

  const [_, hours, minutes, seconds] = timeParts;
  return (parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(seconds, 10)) * 1000;
}

// Función para leer la lista negra
function readBlacklist() {
  if (fs.existsSync(blacklistFilePath)) {
    return JSON.parse(fs.readFileSync(blacklistFilePath, 'utf8'));
  }
  return [];
}

// Función para agregar una aldea a la lista negra
function addToBlacklist(targetMapId, errorMessage) {
  const blacklist = readBlacklist();

  // Verificar si la aldea ya está en la lista negra
  const exists = blacklist.some(entry => entry.targetMapId[0] === targetMapId[0] && entry.targetMapId[1] === targetMapId[1]);

  if (!exists) {
    blacklist.push({ targetMapId, errorMessage });
    fs.writeFileSync(blacklistFilePath, JSON.stringify(blacklist, null, 2));
    console.log(`Aldea [${targetMapId[0]}|${targetMapId[1]}] agregada a la lista negra.`);
  }
}

// Función para verificar si una aldea está en la lista negra
function isInBlacklist(targetMapId) {
  const blacklist = readBlacklist();
  return blacklist.some(entry => entry.targetMapId[0] === targetMapId[0] && entry.targetMapId[1] === targetMapId[1]);
}

export async function processTroopConfig(page, aldea, baseUrl) {
  const aldeaLogFilePath = path.join(temporalDir, `log_${aldea.name}.json`);
  let aldeaLogData = {};

  // Leer el archivo de log específico para cada aldea
  if (fs.existsSync(aldeaLogFilePath)) {
    aldeaLogData = JSON.parse(fs.readFileSync(aldeaLogFilePath, 'utf8'));
  } else {
    fs.writeFileSync(aldeaLogFilePath, JSON.stringify({}, null, 2));
  }

  // Leer el archivo JSON de aldeas inactivas
  const inactiveVillages = readInactiveVillagesFile();

  // Iterar sobre las aldeas inactivas
  for (const village of inactiveVillages) {
    const { targetMapId, population, player } = village;

    // Verificar si la aldea está en la lista negra
    if (isInBlacklist(targetMapId)) {
      console.log(`Aldea [${targetMapId[0]}|${targetMapId[1]}] está en la lista negra. Omitiendo...`);
      continue;
    }

    // Verificar si la aldea actual es la que debe atacar
    if (village.aldeas.includes(aldea.name)) {
      const url = `${baseUrl}x=${targetMapId[0]}&y=${targetMapId[1]}`;
      try {
        
        // Verificar si ya hay un ataque en progreso para esta aldea objetivo
        const lastAttack = aldeaLogData[targetMapId];

        if (lastAttack) {
          const lastExecuted = new Date(lastAttack.lastExecuted); // Fecha y hora del último ataque
          const arrivalTimeMs = parseTimeInterval(lastAttack.arrivalTime) * 2; // Tiempo de llegada en milisegundos
          const arrivalTime = new Date(lastExecuted.getTime() + arrivalTimeMs); // Fecha y hora de llegada

          const currentTime = new Date(); // Tiempo actual

          // Si el tiempo actual es menor que la fecha de llegada, omitir el envío de tropas
          if (currentTime < arrivalTime) {
            console.log(`Ya hay tropas en camino a [${targetMapId[0]}|${targetMapId[1]}]. Omitiendo...`);
            continue;
          }
        }

        console.log(`Visitando URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Verificar si la aldea objetivo existe
        const errorSelector = 'p.error';
        const errorExists = await page.$(errorSelector).catch(() => null);

        if (errorExists) {
          // Extraer el mensaje de error
          const errorMessage = await page.$eval(errorSelector, el => el.textContent.trim());

          // Agregar la aldea a la lista negra
          addToBlacklist(targetMapId, errorMessage);

          console.log(`Aldea [${targetMapId[0]}|${targetMapId[1]}] no cumple las condiciones. Mensaje: ${errorMessage}`);
          continue;
        }

        // Calcular la cantidad de tropas requerida
        const requiredAmount = calculateTroopAmount(population);

        // Obtener la primera tropa disponible que cumpla con la cantidad requerida
        const troopData = await getAllAvailableTroops(page, requiredAmount);

        if (!troopData) {
          console.log("No hay tropas disponibles para atacar. Omitiendo...");
          //continue;
          break;
        }

        const { troopType, availableCount } = troopData;

        console.log(`Configurando tropas ${troopType}: ${requiredAmount} (disponibles: ${availableCount})`);
        await page.waitForSelector(`input[name='troop[${troopType}]']`, { timeout: 10000 });

        const inputSelector = `input[name='troop[${troopType}]']`;
        await page.evaluate(
          (selector, value) => {
            const input = document.querySelector(selector);
            if (input) {
              input.value = "";
              input.value = value;
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          },
          inputSelector,
          requiredAmount
        );

        const radioSelector = "input[type='radio'][name='eventType'][value='4']";
        await page.waitForSelector(radioSelector, { timeout: 5000 });
        await page.click(radioSelector);
        console.log("Opción de ataque seleccionada.");

        const submitButtonSelector = "button[type='submit'][name='ok']";
        await page.waitForSelector(submitButtonSelector, { timeout: 5000 });
        await page.click(submitButtonSelector);
        console.log("Formulario enviado.");


        // Verificar si la aldea objetivo existe
        const errorExistsConfirm = await page.$(errorSelector).catch(() => null);

        if (errorExistsConfirm) {
          // Extraer el mensaje de error
          const errorMessage = await page.$eval(errorSelector, el => el.textContent.trim());

          // Agregar la aldea a la lista negra
          addToBlacklist(targetMapId, errorMessage);

          console.log(`Aldea [${targetMapId[0]}|${targetMapId[1]}] no cumple las condiciones. Mensaje: ${errorMessage}`);
          continue;
        }

        // Capturar el tiempo de llegada de las tropas
        const arrivalTime = await captureArrivalTime(page);
        console.log(`Tiempo de llegada de las tropas: ${arrivalTime}`);

        // Guardar el tiempo de llegada en el log
        aldeaLogData[targetMapId] = {
          lastExecuted: new Date().toISOString(),
          arrivalTime,
        };
        fs.writeFileSync(aldeaLogFilePath, JSON.stringify(aldeaLogData, null, 2));

        const confirmButtonSelector = "#confirmSendTroops";
        console.log("Esperando pantalla de confirmación...");
        await page.waitForSelector(confirmButtonSelector, { timeout: 10000 });
        await page.click(confirmButtonSelector);
        console.log("Confirmación enviada.");

        console.log(`Tarea completada para el enlace: ${url}`);
      } catch (error) {
        // Guardar el error en el log de errores
        const errorMessage = `Error procesando el enlace ${url}: ${error.message}`;
        console.error(`\x1b[31mError en targetMapId ${targetMapId}: ${error.message}\x1b[0m`);
        logErrorToFile(errorMessage);
        continue;
      }
    }
  }
}

// Función para registrar errores en el archivo de log
function logErrorToFile(errorMessage) {
  const errorLogFilePath = path.join(temporalDir, 'error_log.json');
  let errorLogData = [];

  if (fs.existsSync(errorLogFilePath)) {
    errorLogData = JSON.parse(fs.readFileSync(errorLogFilePath, 'utf8'));
  }

  const newErrorLog = {
    timestamp: new Date().toISOString(),
    message: errorMessage,
  };
  errorLogData.push(newErrorLog);
  fs.writeFileSync(errorLogFilePath, JSON.stringify(errorLogData, null, 2));
} 


//sendOffensiveTroops


// Función para enviar todas las tropas ofensivas y catapultas
export async function sendOffensiveTroops(page, aldea, baseUrl) {
  const { targetX, targetY } = aldea.task.find(task => task.name === "sendOffensiveTroops");
  const url = `${baseUrl}x=${targetX}&y=${targetY}`;

  try {
    console.log(`Visitando URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Verificar si la aldea objetivo existe
    const errorSelector = 'p.error';
    const errorExists = await page.$(errorSelector).catch(() => null);

    if (errorExists) {
      // Extraer el mensaje de error
      const errorMessage = await page.$eval(errorSelector, el => el.textContent.trim());

      // Agregar la aldea a la lista negra
      addToBlacklist([targetX, targetY], errorMessage);

      console.log(`Aldea [${targetX}|${targetY}] no cumple las condiciones. Mensaje: ${errorMessage}`);
      return;
    }

    // Obtener la cantidad de tropas disponibles
    const troopsAvailable = await getAllAvailableTroops(page);

    if (!troopsAvailable) {
      console.log("No hay tropas disponibles para atacar. Omitiendo...");
      return;
    }

    // Enviar todas las tropas ofensivas (t1, t3, t5, t6, t7)
    const offensiveTroops = ['t1', 't3', 't5', 't6', 't7'];
    for (const troopType of offensiveTroops) {
      const availableCount = troopsAvailable[troopType] || 0;
      if (availableCount > 0) {
        console.log(`Enviando todas las tropas de tipo ${troopType}: ${availableCount}`);
        await page.evaluate(
          (selector, value) => {
            const input = document.querySelector(selector);
            if (input) {
              input.value = "";
              input.value = value;
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          },
          `input[name='troop[${troopType}]']`,
          availableCount
        );
      }
    }

    // Enviar 100 catapultas (t8)
    const catapultCount = Math.min(troopsAvailable['t8'] || 0, 100);
    if (catapultCount > 0) {
      console.log(`Enviando 100 catapultas (t8): ${catapultCount}`);
      await page.evaluate(
        (selector, value) => {
          const input = document.querySelector(selector);
          if (input) {
            input.value = "";
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        },
        `input[name='troop[t8]']`,
        catapultCount
      );
    }

    // Seleccionar la opción de ataque
    const radioSelector = "input[type='radio'][name='eventType'][value='4']";
    await page.waitForSelector(radioSelector, { timeout: 5000 });
    await page.click(radioSelector);
    console.log("Opción de ataque seleccionada.");

    // Enviar el formulario
    const submitButtonSelector = "button[type='submit'][name='ok']";
    await page.waitForSelector(submitButtonSelector, { timeout: 5000 });
    await page.click(submitButtonSelector);
    console.log("Formulario enviado.");

    // Capturar el tiempo de llegada de las tropas
    const arrivalTime = await captureArrivalTime(page);
    console.log(`Tiempo de llegada de las tropas: ${arrivalTime}`);

    // Guardar el tiempo de llegada en el log
    const aldeaLogFilePath = path.join(temporalDir, `log_${aldea.name}.json`);
    let aldeaLogData = {};

    if (fs.existsSync(aldeaLogFilePath)) {
      aldeaLogData = JSON.parse(fs.readFileSync(aldeaLogFilePath, 'utf8'));
    } else {
      fs.writeFileSync(aldeaLogFilePath, JSON.stringify({}, null, 2));
    }

    aldeaLogData[[targetX, targetY]] = {
      lastExecuted: new Date().toISOString(),
      arrivalTime,
    };
    fs.writeFileSync(aldeaLogFilePath, JSON.stringify(aldeaLogData, null, 2));

    // Confirmar el envío de tropas
    const confirmButtonSelector = "#confirmSendTroops";
    console.log("Esperando pantalla de confirmación...");
    await page.waitForSelector(confirmButtonSelector, { timeout: 10000 });
    await page.click(confirmButtonSelector);
    console.log("Confirmación enviada.");

    console.log(`Primer ataque completado para el enlace: ${url}`);

    // Calcular las catapultas restantes
    const remainingCatapults = (troopsAvailable['t8'] || 0) - catapultCount;

    if (remainingCatapults > 0) {
      console.log(`Enviando ataques restantes con ${remainingCatapults} catapultas...`);
      await sendRemainingTroops(page, aldea, baseUrl, remainingCatapults);
    } else {
      console.log("No hay catapultas restantes para enviar.");
    }
  } catch (error) {
    // Guardar el error en el log de errores
    const errorMessage = `Error procesando el enlace ${url}: ${error.message}`;
    console.error(`\x1b[31mError en targetMapId [${targetX}|${targetY}]: ${error.message}\x1b[0m`);
    logErrorToFile(errorMessage);
  }
}

// Función para enviar los ataques restantes con t2 y catapultas
async function sendRemainingTroops(page, aldea, baseUrl, remainingCatapults) {
  const { targetX, targetY } = aldea.task.find(task => task.name === "sendOffensiveTroops");
  const url = `${baseUrl}x=${targetX}&y=${targetY}`;

  try {
    console.log(`Visitando URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Verificar si la aldea objetivo existe
    const errorSelector = 'p.error';
    const errorExists = await page.$(errorSelector).catch(() => null);

    if (errorExists) {
      // Extraer el mensaje de error
      const errorMessage = await page.$eval(errorSelector, el => el.textContent.trim());

      // Agregar la aldea a la lista negra
      addToBlacklist([targetX, targetY], errorMessage);

      console.log(`Aldea [${targetX}|${targetY}] no cumple las condiciones. Mensaje: ${errorMessage}`);
      return;
    }

    // Obtener la cantidad de tropas disponibles
    const troopsAvailable = await getAllAvailableTroops(page);

    if (!troopsAvailable) {
      console.log("No hay tropas disponibles para atacar. Omitiendo...");
      return;
    }

    // Calcular la cantidad de t2 a enviar por ataque
    const t2Available = troopsAvailable['t2'] || 0;
    const t2PerAttack = Math.floor(t2Available / remainingCatapults);

    if (t2PerAttack <= 0) {
      console.log("No hay suficientes tropas t2 para acompañar las catapultas restantes.");
      return;
    }

    // Enviar los ataques restantes
    for (let i = 0; i < remainingCatapults; i++) {
      const catapultCount = 1; // Enviar 1 catapulta por ataque
      const t2Count = t2PerAttack;

      console.log(`Enviando ataque ${i + 1} con ${t2Count} t2 y ${catapultCount} catapultas`);

      // Configurar las tropas
      await page.evaluate(
        (selector, value) => {
          const input = document.querySelector(selector);
          if (input) {
            input.value = "";
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        },
        `input[name='troop[t2]']`,
        t2Count
      );

      await page.evaluate(
        (selector, value) => {
          const input = document.querySelector(selector);
          if (input) {
            input.value = "";
            input.value = value;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        },
        `input[name='troop[t8]']`,
        catapultCount
      );

      // Seleccionar la opción de ataque
      const radioSelector = "input[type='radio'][name='eventType'][value='4']";
      await page.waitForSelector(radioSelector, { timeout: 5000 });
      await page.click(radioSelector);
      console.log("Opción de ataque seleccionada.");

      // Enviar el formulario
      const submitButtonSelector = "button[type='submit'][name='ok']";
      await page.waitForSelector(submitButtonSelector, { timeout: 5000 });
      await page.click(submitButtonSelector);
      console.log("Formulario enviado.");

      // Capturar el tiempo de llegada de las tropas
      const arrivalTime = await captureArrivalTime(page);
      console.log(`Tiempo de llegada de las tropas: ${arrivalTime}`);

      // Guardar el tiempo de llegada en el log
      const aldeaLogFilePath = path.join(temporalDir, `log_${aldea.name}.json`);
      let aldeaLogData = {};

      if (fs.existsSync(aldeaLogFilePath)) {
        aldeaLogData = JSON.parse(fs.readFileSync(aldeaLogFilePath, 'utf8'));
      } else {
        fs.writeFileSync(aldeaLogFilePath, JSON.stringify({}, null, 2));
      }

      aldeaLogData[[targetX, targetY]] = {
        lastExecuted: new Date().toISOString(),
        arrivalTime,
      };
      fs.writeFileSync(aldeaLogFilePath, JSON.stringify(aldeaLogData, null, 2));

      // Confirmar el envío de tropas
      const confirmButtonSelector = "#confirmSendTroops";
      console.log("Esperando pantalla de confirmación...");
      await page.waitForSelector(confirmButtonSelector, { timeout: 10000 });
      await page.click(confirmButtonSelector);
      console.log("Confirmación enviada.");

      console.log(`Ataque ${i + 1} completado para el enlace: ${url}`);
    }
  } catch (error) {
    // Guardar el error en el log de errores
    const errorMessage = `Error procesando el enlace ${url}: ${error.message}`;
    console.error(`\x1b[31mError en targetMapId [${targetX}|${targetY}]: ${error.message}\x1b[0m`);
    logErrorToFile(errorMessage);
  }
}