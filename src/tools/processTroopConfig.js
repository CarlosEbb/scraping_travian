import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual usando import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cambiar la ruta de la carpeta 'temporal' para que esté en el directorio raíz
const temporalDir = path.join(__dirname, '..', 'temporal');

// Verificar si la carpeta 'temporal' existe, si no, crearla
if (!fs.existsSync(temporalDir)) {
  fs.mkdirSync(temporalDir, { recursive: true });
  console.log("Carpeta 'temporal' creada.");
}

export async function processTroopConfig(page, aldea, troopConfigs, baseUrl) {
  const aldeaLogFilePath = path.join(temporalDir, `log_${aldea.name}.json`);
  let aldeaLogData = {};

  // Leer el archivo de log específico para cada aldea
  if (fs.existsSync(aldeaLogFilePath)) {
    aldeaLogData = JSON.parse(fs.readFileSync(aldeaLogFilePath, "utf8"));
  } else {
    fs.writeFileSync(aldeaLogFilePath, JSON.stringify({}, null, 2));
  }

  // Iterar sobre las configuraciones de tropas para esta aldea
  for (const { targetMapId, troopTypes, timeInterval, aldeas: targetAldeas } of troopConfigs) {
    // Si no se especifica el campo `aldeas`, aplicar a todas las aldeas
    const appliesToAldea = !targetAldeas || targetAldeas.includes(aldea.name);

    if (appliesToAldea) {
      const lastExecuted = aldeaLogData[targetMapId] ? new Date(aldeaLogData[targetMapId]) : new Date(0);
      const currentTime = new Date();
      const timeIntervalMs = parseTimeInterval(timeInterval) * 1000 * 2;

      if (currentTime - lastExecuted >= timeIntervalMs) {
        const url = baseUrl + targetMapId;
        try {
          console.log(`Visitando URL: ${url}`);
          await page.goto(url, { timeout: 60000 });

          for (const { troopType, amount } of troopTypes) {
            console.log(`Configurando tropas ${troopType}: ${amount}`);
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
              amount
            );
          }

          const radioSelector = "input[type='radio'][name='eventType'][value='4']";
          await page.waitForSelector(radioSelector, { timeout: 5000 });
          await page.click(radioSelector);
          console.log("Opción de ataque seleccionada.");

          const submitButtonSelector = "button[type='submit'][name='ok']";
          await page.waitForSelector(submitButtonSelector, { timeout: 5000 });
          await page.click(submitButtonSelector);
          console.log("Formulario enviado.");

          const confirmButtonSelector = "#confirmSendTroops";
          console.log("Esperando pantalla de confirmación...");
          await page.waitForSelector(confirmButtonSelector, { timeout: 10000 });
          await page.click(confirmButtonSelector);
          console.log("Confirmación enviada.");

          console.log(`Tarea completada para el enlace: ${url}`);

          // Registrar la ejecución en el log de la aldea
          aldeaLogData[targetMapId] = currentTime.toISOString();
          fs.writeFileSync(aldeaLogFilePath, JSON.stringify(aldeaLogData, null, 2));

        } catch (error) {
          // Guardar el error en el log de errores
          const errorMessage = `Error procesando el enlace ${url}: ${error.message}`;
          
          // Mostrar el error en rojo y destacar el targetMapId
          console.error(`\x1b[31mError en targetMapId ${targetMapId}: ${error.message}\x1b[0m`);

          logErrorToFile(errorMessage);
          
          // Continuar con la siguiente iteración (no detener el proceso completo)
          continue;
        }
      } else {
        console.log(`Aún no ha pasado el tiempo para ejecutar el enlace ${targetMapId}`);
      }
    }
  }
}

// Función auxiliar para parsear el intervalo de tiempo
function parseTimeInterval(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(num => parseInt(num, 10));
  return ((hours * 3600) + (minutes * 60) + seconds);
}

// Función para registrar errores en el archivo de log
function logErrorToFile(errorMessage) {
  const errorLogFilePath = path.join(temporalDir, 'error_log.json');

  let errorLogData = [];

  // Si el archivo de log ya existe, leemos los datos
  if (fs.existsSync(errorLogFilePath)) {
    errorLogData = JSON.parse(fs.readFileSync(errorLogFilePath, 'utf8'));
  }

  // Agregamos el nuevo error con la fecha actual
  const newErrorLog = {
    timestamp: new Date().toISOString(),
    message: errorMessage,
  };
  errorLogData.push(newErrorLog);

  // Escribimos los datos actualizados en el archivo
  fs.writeFileSync(errorLogFilePath, JSON.stringify(errorLogData, null, 2));
}
