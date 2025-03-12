import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual usando import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta de la carpeta temporal
const temporalDir = path.join(__dirname, '..', 'temporal');

// Ruta del archivo oasis.json
const oasisFilePath = path.join(temporalDir, 'oasis.json');

// Ruta del archivo de lista negra (coordenadas ya revisadas)
const blacklistFilePath = path.join(temporalDir, 'oasis_blacklist.json');

// Función para calcular la distancia entre dos puntos
function calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Función para obtener coordenadas alrededor de un punto inicial, ordenadas por distancia
function getSurroundingCoordinates(startX, startY, radius) {
    const coordinates = [];

    // Recorremos en un radio alrededor de la coordenada inicial
    for (let x = startX - radius; x <= startX + radius; x++) {
        for (let y = startY - radius; y <= startY + radius; y++) {
            // Verificamos que las coordenadas estén dentro del rango del mapa de Travian
            if (x >= -200 && x <= 200 && y >= -200 && y <= 200) {
                // Calculamos la distancia al punto inicial
                const distance = calculateDistance(startX, startY, x, y);
                coordinates.push({ x, y, distance });
            }
        }
    }

    // Ordenamos las coordenadas por distancia (de menor a mayor)
    coordinates.sort((a, b) => a.distance - b.distance);

    // Eliminamos la propiedad "distance" para devolver solo las coordenadas
    return coordinates.map(({ x, y }) => ({ x, y }));
}

// Función para verificar si una coordenada es un oasis libre
async function isFreeOasis(page, x, y) {
    const oasisUrl = `${process.env.BASE_URL}/karte.php?x=${x}&y=${y}`;
    await page.goto(oasisUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Verificar si es un oasis libre
    const oasisTitleSelector = '#tileDetails h1.titleInHeader';
    const oasisTitleExists = await page.$(oasisTitleSelector).catch(() => null);

    if (oasisTitleExists) {
        const oasisTitle = await page.$eval(oasisTitleSelector, el => el.textContent.trim());
        if (oasisTitle.includes("Oasis libre")) {
            return true; // Es un oasis libre
        }
    }

    return false; // No es un oasis libre
}

// Función para leer el archivo oasis.json
function readOasisFile() {
    if (fs.existsSync(oasisFilePath)) {
        return JSON.parse(fs.readFileSync(oasisFilePath, 'utf8'));
    }
    return { oasis: [] }; // Retornar un objeto vacío si el archivo no existe
}

// Función para escribir en el archivo oasis.json
function writeOasisFile(data) {
    fs.writeFileSync(oasisFilePath, JSON.stringify(data, null, 2));
}

// Función para leer la lista negra de coordenadas ya revisadas
function readBlacklist() {
    if (fs.existsSync(blacklistFilePath)) {
        return JSON.parse(fs.readFileSync(blacklistFilePath, 'utf8'));
    }
    return []; // Retornar un array vacío si el archivo no existe
}

// Función para escribir en la lista negra
function writeBlacklist(data) {
    fs.writeFileSync(blacklistFilePath, JSON.stringify(data, null, 2));
}

// Función principal para encontrar oasis libres
export async function findFreeOasis(page, startX, startY, radius) {
    // Obtener las coordenadas alrededor del punto inicial
    const surroundingCoordinates = getSurroundingCoordinates(startX, startY, radius);

    // Leer el archivo oasis.json y la lista negra
    const oasisData = readOasisFile();
    const blacklist = readBlacklist();

    // Iterar sobre las coordenadas
    for (const coord of surroundingCoordinates) {
        const { x, y } = coord;

        // Verificar si la coordenada ya fue revisada
        if (blacklist.some(c => c.x === x && c.y === y)) {
            console.log(`Coordenadas [${x}|${y}] ya revisadas. Omitiendo...`);
            continue;
        }

        console.log(`Verificando coordenadas [${x}|${y}]...`);

        // Verificar si es un oasis libre
        const isFree = await isFreeOasis(page, x, y);
        if (isFree) {
            console.log(`Oasis libre encontrado en [${x}|${y}]. Agregando al archivo oasis.json...`);

            // Verificar si el oasis ya está en la lista
            const exists = oasisData.oasis.some(o => o.x === x && o.y === y);
            if (!exists) {
                oasisData.oasis.push({ x, y }); // Agregar el oasis a la lista
                writeOasisFile(oasisData); // Escribir inmediatamente en el archivo
            }
        }

        // Agregar la coordenada a la lista negra (ya revisada)
        blacklist.push({ x, y });
        writeBlacklist(blacklist); // Escribir inmediatamente en la lista negra
    }

    console.log("Búsqueda de oasis libres completada.");
}