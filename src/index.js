import puppeteer from "puppeteer";
import fs from "fs";
import { createTroops } from "./tools/troops.js";
import { manageCookies } from "./tools/cookies.js";
import { switchToAldea } from "./tools/switchToAldea.js"; 
import { processTroopConfig, sendOffensiveTroops } from "./tools/processTroopConfig.js"; 
import { upgradeResourceField } from "./tools/upgradeResourceField.js"; 
import { balanceResources } from './tools/balanceResources.js';
import { sendResources } from './tools/sendResources.js';
import { findInactiveVillages } from './tools/findInactiveVillages.js';
import { celebrateFestival } from './tools/celebrateFestival.js';
import { detectAttacks } from './tools/detectAttacks.js';
import { attackOasis } from './tools/attackOasis.js';
import { findFreeOasis } from './tools/findFreeOasis.js';

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

  // const startX = 35; // Coordenada X inicial
  // const startY = 1;  // Coordenada Y inicial
  // const radius = 50; // Radio de búsqueda

  // await findFreeOasis(page, startX, startY, radius);

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
  
    // Verificar si la tarea celebrateFestival está asignada
    const hasCelebrateFestivalTask = aldea.task.some(task => task.name === "celebrateFestival");
    const festivalType = aldea.task.find(t => t.name === "celebrateFestival")?.tipo || "1";

    // Verificar si hay fiestas activas
    let hasActiveFestivals = false;
    if (hasCelebrateFestivalTask) {
      const festivalStatus = await celebrateFestival(page, aldea, festivalType);
      hasActiveFestivals = festivalStatus.hasFestivalInProgress;
    }
  
    // Determinar si se deben ejecutar tareas que consumen recursos
    const shouldExecuteResourceConsumingTasks = !hasCelebrateFestivalTask || hasActiveFestivals;
  
    // Ejecutar las tareas asignadas a la aldea
    for (const task of aldea.task) {
      // Verificar si hay ataques
      const attacks = await detectAttacks(page);
      if (attacks.length > 0) {
        console.log(`Se detectaron ataques en la aldea ${aldea.name}. Ejecutando tareas adicionales...`);
        const targetAldea = aldeas.find(a => a.name === aldea.emergencyResourceReceiver);
        if (targetAldea) {
          console.log(`Enviando recursos desde la aldea ${aldea.name} a la aldea ${targetAldea.name} debido a un ataque.`);
          await sendResources(page, aldea, targetAldea);
        } else {
          console.log(`No se encontró la aldea de destino para enviar recursos desde ${aldea.name}.`);
        }
      }

      if (task.name === "attackOasis") {
          console.log(`Atacando oasis desde la aldea ${aldea.name}`);
          await attackOasis(page, aldea, baseUrl);
      }
  
      // Tareas que no consumen recursos (siempre se ejecutan)
      if (task.name === "balanceResources" || task.name === "sendOffensiveTroops" || task.name === "processTroopConfig") {
        console.log(`Ejecutando tarea que no consume recursos: ${task.name}`);
        if (task.name === "balanceResources") {
          console.log(`Balanceando recursos en la aldea ${aldea.name}`);
          await balanceResources(page);
        } else if (task.name === "sendOffensiveTroops") {
          console.log(`Enviando tropas ofensivas desde la aldea ${aldea.name}`);
          await sendOffensiveTroops(page, aldea, baseUrl);
        } else if (task.name === "processTroopConfig") {
          console.log(`Procesando misión para enviar tropas desde la aldea ${aldea.name}`);
          await processTroopConfig(page, aldea, baseUrl);
        }
      }
  
      // Tarea celebrateFestival (siempre se ejecuta)
      else if (task.name === "celebrateFestival") {
        console.log(`Realizando fiesta en la aldea ${aldea.name}`);
        await celebrateFestival(page, aldea, festivalType);
      }
  
      // Tareas que consumen recursos (solo se ejecutan si hay fiestas activas o no está asignada celebrateFestival)
      else if (shouldExecuteResourceConsumingTasks) {
        console.log(`Ejecutando tarea que consume recursos: ${task.name}`);
        if (task.name === "sendResources") {
          console.log(`Enviando recursos desde la aldea ${aldea.name}`);
          await sendResources(page, aldea);
        } else if (task.name === "createTroops") {
          for (const type of task.troopType) {
            console.log(`Creando tropas de tipo ${type} para la aldea ${aldea.name}`);
            await createTroops(page, type);
          }
        } else if (task.name === "upgradeResourceField") {
          console.log(`Mejorando campos de recursos para la aldea ${aldea.name}`);
          await upgradeResourceField(page, aldea, aldeaLogData);
        }
      } else {
        console.log(`No se ejecuta la tarea ${task.name} porque no hay fiestas activas y está asignada celebrateFestival.`);
      }
    }
  }
  
  console.log("Todas las tareas completadas.");
  await browser.close();
}

let retryCount = 0;
const maxRetries = 5;
let isFirstExecution = true;

// Función para generar un número aleatorio entre un mínimo y un máximo
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function executeTasksRecursively(config) {
  try {
    // Ejecutar la tarea de buscar aldeas inactivas una vez al día
    const config = await reloadConfig();
    await findInactiveVillages(config.aldeas);
    await automateTask(config);

    retryCount = 0; // Resetear el contador de reintentos si la tarea se ejecuta correctamente

    // Si no es la primera ejecución, agregar un delay aleatorio entre 1 y 5 minutos
    if (!isFirstExecution) {
      const randomDelay = getRandomDelay(60000, 300000); // Entre 1 y 5 minutos
      console.log(`Esperando ${randomDelay / 1000} segundos antes de la siguiente ejecución...`);
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    } else {
      isFirstExecution = false; // Marcar que ya no es la primera ejecución
    }

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