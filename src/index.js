import puppeteer from "puppeteer";
import fs from "fs";
import { createTroops } from "./tools/troops.js";
import { manageCookies } from "./tools/cookies.js";
import { switchToAldea } from "./tools/switchToAldea.js"; 
import { processTroopConfig } from "./tools/processTroopConfig.js"; 
import { upgradeResourceField } from "./tools/upgradeResourceField.js"; 
import { balanceResources } from './tools/balanceResources.js';
import { sendResources } from './tools/sendResources.js';
import { findInactiveVillages } from './tools/findInactiveVillages.js';

import { fileURLToPath } from "url";
import path from "path";
import dotenv from 'dotenv';

// Obtener el directorio actual usando import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Cargar la configuración desde el archivo JSON
//const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
async function reloadConfig() {
  const config = JSON.parse(await fs.promises.readFile("config.json", "utf8"));
  return config;
}

const baseUrl = `${process.env.BASE_URL}/build.php?id=39&gid=16&tt=2&`;

async function automateTask(config) {
  const browser = await puppeteer.launch({ headless: true, slowMo: 50 });
  const page = await browser.newPage();

  const { loginUrl, username, password, aldeas, troopConfigs } = config;

  let logData = {};
  const logFilePath = path.join(__dirname, "temporal", "log.json");

  // Verificar si la carpeta 'temporal' existe, si no, crearla
  if (!fs.existsSync(path.dirname(logFilePath))) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    console.log("Carpeta 'temporal' creada.");
  }

  await manageCookies(page, process.env.BASE_URL+loginUrl, username, password);

  // Iterar sobre las aldeas disponibles
  for (const aldea of aldeas) {
    console.log(`Procesando aldea: ${aldea.name}`);

    // Leer el archivo de log específico para cada aldea
    let aldeaLogData = {};
    const aldeaLogFilePath = path.join(__dirname, "temporal", `log_${aldea.name}.json`);
    if (fs.existsSync(aldeaLogFilePath)) {
      aldeaLogData = JSON.parse(fs.readFileSync(aldeaLogFilePath, "utf8"));
    } else {
      fs.writeFileSync(aldeaLogFilePath, JSON.stringify({}, null, 2));
    }

    // Cambiar a la aldea actual
    await switchToAldea(page, aldea.newdid);

    // Ejecutar las tareas asignadas a la aldea
    for (const task of aldea.task) {

      if (task.name === "balanceResources") {
        console.log(`Balanceando recursos en la aldea ${aldea.name}`);
        await balanceResources(page);
      }
      
      if (task.name === "createTroops") {
        for (const type of task.troopType) {
          console.log(`Creando tropas de tipo ${type} para la aldea ${aldea.name}`);
          await createTroops(page, type); // Crear tropas según el tipo especificado
        }
      }

      if (task.name === "processTroopConfig") {
        console.log(`Procesando misión para enviar tropas desde la aldea ${aldea.name}`);
        await processTroopConfig(page, aldea, baseUrl);
      }

      if (task.name === "upgradeResourceField") {
        console.log(`Mejorando campos de recursos para la aldea ${aldea.name}`);
        await upgradeResourceField(page, aldea, aldeaLogData); // Ejecutar la mejora de campos de recursos
      }

      if (task.name === "sendResources") {
        console.log(`Enviando recursos desde la aldea ${aldea.name}`);
        await sendResources(page, aldea);
      }
    }
  }

  console.log("Todas las tareas completadas.");
  await browser.close();
}

let retryCount = 0;
const maxRetries = 5;

async function executeTasksRecursively(config) {
  try {

    // Ejecutar la tarea de buscar aldeas inactivas una vez al día
    await findInactiveVillages();
    
    const config = await reloadConfig();
    await automateTask(config);

    retryCount = 0; // Resetear el contador de reintentos si la tarea se ejecuta correctamente
    await executeTasksRecursively(config);
  } catch (error) {
    console.error("Error ejecutando las tareas:", error);
    retryCount++;
    if (retryCount <= maxRetries) {
      setTimeout(() => executeTasksRecursively(config), 50000);
    } else {
      console.error("Número máximo de reintentos alcanzado. Deteniendo el proceso.");
    }
  }
}

executeTasksRecursively();