import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAllAvailableTroops } from './processTroopConfig.js';
// Obtener el directorio actual usando import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta de la carpeta temporal
const temporalDir = path.join(__dirname, '..', 'temporal');

// Ruta del archivo de lista negra
const blacklistFilePath = path.join(temporalDir, 'blacklist.json');

// Función para verificar si las coordenadas corresponden a un oasis válido
async function isValidOasis(page, x, y) {
    const oasisUrl = `${process.env.BASE_URL}/karte.php?x=${x}&y=${y}`;
    await page.goto(oasisUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Verificar si la página muestra un mensaje de error
    const errorSelector = 'p.error';
    const errorExists = await page.$(errorSelector).catch(() => null);

    if (errorExists) {
        const errorMessage = await page.$eval(errorSelector, el => el.textContent.trim());
        console.log(`Coordenadas [${x}|${y}] no son válidas. Mensaje: ${errorMessage}`);
        return false; // No es un oasis válido
    }

    // Verificar si existe la tabla de animales (#troop_info)
    const troopInfoSelector = '#troop_info';
    const troopInfoExists = await page.$(troopInfoSelector).catch(() => null);

    return troopInfoExists !== null; // Retorna true si es un oasis válido
}

// Función para verificar si hay animales en el oasis
async function checkOasisForAnimals(page, x, y) {
    const oasisUrl = `${process.env.BASE_URL}/karte.php?x=${x}&y=${y}`;
    await page.goto(oasisUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Verificar si es un oasis válido
    // const isValid = await isValidOasis(page, x, y);
    // if (!isValid) {
    //     console.log(`Coordenadas [${x}|${y}] no corresponden a un oasis válido.`);
    //     return false; // No es un oasis válido
    // }

    // Verificar si hay animales en el oasis
    const troopInfoSelector = '#troop_info';
    const troopInfoExists = await page.$(troopInfoSelector).catch(() => null);

    if (troopInfoExists) {
        // Verificar si la tabla contiene la palabra "ninguno" (sin animales)
        const noAnimalsText = await page.$eval(troopInfoSelector, el => el.textContent.trim());
        if (noAnimalsText.includes("ninguno")) {
            return false; // No hay animales en el oasis
        }

        // Si no contiene "ninguno", asumimos que hay animales
        return true;
    }

    return false; // No se encontró la tabla de animales
}

// Función para leer el archivo JSON de oasis
function readOasisFile() {
    const oasisFilePath = path.join(temporalDir, 'oasis.json');
    if (fs.existsSync(oasisFilePath)) {
        return JSON.parse(fs.readFileSync(oasisFilePath, 'utf8'));
    }
    return { oasis: [] }; // Retornar un objeto vacío si el archivo no existe
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
        console.log(`Oasis [${targetMapId[0]}|${targetMapId[1]}] agregado a la lista negra.`);
    }
}

// Función para verificar si un oasis está en la lista negra
function isInBlacklist(targetMapId) {
    const blacklist = readBlacklist();
    return blacklist.some(entry => entry.targetMapId[0] === targetMapId[0] && entry.targetMapId[1] === targetMapId[1]);
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
    const timeParts = timeString.match(/(\d+):(\d+):(\d+)/);
    if (!timeParts) {
        console.error(`Formato de tiempo no válido: ${timeString}`);
        return 0;
    }

    const [_, hours, minutes, seconds] = timeParts;
    return (parseInt(hours, 10) * 3600 + parseInt(minutes, 10) * 60 + parseInt(seconds, 10)) * 1000;
}

export async function attackOasis(page, aldea, baseUrl) {
    const aldeaLogFilePath = path.join(temporalDir, `log_${aldea.name}.json`);
    let aldeaLogData = {};

    // Leer el archivo de log específico para cada aldea
    if (fs.existsSync(aldeaLogFilePath)) {
        aldeaLogData = JSON.parse(fs.readFileSync(aldeaLogFilePath, 'utf8'));
    } else {
        fs.writeFileSync(aldeaLogFilePath, JSON.stringify({}, null, 2));
    }

    // Leer el archivo JSON de oasis
    const oasisData = readOasisFile();
    const { oasis } = oasisData;

    // Iterar sobre los oasis
    for (const oasisCoord of oasis) {
        const { x, y } = oasisCoord;
        const targetMapId = [x, y];

        // Verificar si el oasis está en la lista negra
        if (isInBlacklist(targetMapId)) {
            console.log(`Oasis [${x}|${y}] está en la lista negra. Omitiendo...`);
            continue;
        }

        // Verificar si ya hay un ataque en progreso para este oasis
        const lastAttack = aldeaLogData[targetMapId];
        if (lastAttack) {
            const lastExecuted = new Date(lastAttack.lastExecuted);
            const arrivalTimeMs = parseTimeInterval(lastAttack.arrivalTime) * 2;
            const arrivalTime = new Date(lastExecuted.getTime() + arrivalTimeMs);

            if (new Date() < arrivalTime) {
                console.log(`Ya hay tropas en camino a [${x}|${y}]. Omitiendo...`);
                continue;
            }
        }

        // Verificar si las coordenadas corresponden a un oasis válido
        const isValid = await isValidOasis(page, x, y);
        if (!isValid) {
            console.log(`Coordenadas [${x}|${y}] no corresponden a un oasis válido. Omitiendo...`);
            continue; // Detener el proceso para estas coordenadas
        }

        // Verificar si hay animales en el oasis
        const hasAnimals = await checkOasisForAnimals(page, x, y);
        if (hasAnimals) {
            console.log(`Hay animales en el oasis [${x}|${y}]. Omitiendo...`);
            continue;
        }

        // URL del oasis
        const url = `${baseUrl}x=${x}&y=${y}`;
        console.log(`Visitando URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Verificar si el oasis existe
        const errorSelector = 'p.error';
        const errorExists = await page.$(errorSelector).catch(() => null);

        if (errorExists) {
            const errorMessage = await page.$eval(errorSelector, el => el.textContent.trim());
            addToBlacklist(targetMapId, errorMessage);
            console.log(`Oasis [${x}|${y}] no cumple las condiciones. Mensaje: ${errorMessage}`);
            continue;
        }

        // Enviar tropas (usando la lógica de sendOffensiveTroops)
        const requiredAmount = 2; // Cantidad fija de tropas
        const troopData = await getAllAvailableTroops(page, requiredAmount);

        if (!troopData) {
            console.log("No hay tropas disponibles para atacar. Omitiendo...");
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

        console.log(`Tarea completada para el oasis [${x}|${y}].`);
    }
}