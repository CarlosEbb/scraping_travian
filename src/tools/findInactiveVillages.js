import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta del archivo de log para esta tarea
const logFilePath = path.join(__dirname, '..', 'temporal', 'inactive_villages_log.json');

// Ruta del archivo JSON donde se guardarán las aldeas inactivas
const inactiveVillagesFilePath = path.join(__dirname, '..' , 'temporal', 'inactive_villages.json');

// Función para verificar si la tarea ya se ejecutó hoy
function hasTaskRunToday(logData) {
  const today = new Date().toISOString().split('T')[0]; // Obtener la fecha actual en formato YYYY-MM-DD
  return logData.lastRun === today;
}

// Función principal para buscar aldeas inactivas
export async function findInactiveVillages() {
  // Verificar si la carpeta 'temporal' existe, si no, crearla
  if (!fs.existsSync(path.dirname(logFilePath))) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    console.log("Carpeta 'temporal' creada.");
  }

  // Leer el archivo de log
  let logData = {};
  if (fs.existsSync(logFilePath)) {
    logData = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
  }

  // Verificar si la tarea ya se ejecutó hoy
  if (hasTaskRunToday(logData)) {
    console.log("La tarea ya se ejecutó hoy. No se realizará nuevamente.");
    return;
  }

  // Iniciar Puppeteer
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navegar a la página de búsqueda de aldeas inactivas
    const searchUrl = "https://www.travcotools.com/en/inactive-search/?travian_server=1042&x=98&y=48&days=2&exclude_alliances=1224902&exclude_alliances=1224892&exclude_alliances=1224913&max_pop_increase=0&order_by=distance&page=4";
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Extraer los datos de la tabla
    const inactiveVillages = await page.$$eval('tr.border-bottom', (rows) => {
      return rows.map(row => {
        const playerName = row.querySelector('a.detail-button')?.textContent.trim() || 'Desconocido';
        const population = row.querySelector('span.text-muted.small.tooltip-btn i.fa-users')?.nextSibling?.textContent.trim() || '0';
        const coordinates = row.querySelector('a.tooltip-btn.js-travian_village_url span.text-muted.small')?.textContent.trim() || '[0|0]';

        // Extraer las coordenadas X e Y
        const [x, y] = coordinates.replace(/[\[\]]/g, '').split('|').map(Number);

        return {
          aldeas: ["02"], // Aldeas desde donde se realizarán los ataques (estático por ahora)
          targetMapId: [x, y],
          population: parseInt(population, 10),
          player: playerName,
        };
      });
    });

    console.log("Aldeas inactivas encontradas:", inactiveVillages);

    // Guardar los datos en un archivo JSON
    fs.writeFileSync(inactiveVillagesFilePath, JSON.stringify(inactiveVillages, null, 2));
    console.log(`Datos de aldeas inactivas guardados en ${inactiveVillagesFilePath}`);

    // Actualizar el log con la fecha de la última ejecución
    logData.lastRun = new Date().toISOString().split('T')[0];
    fs.writeFileSync(logFilePath, JSON.stringify(logData, null, 2));
    console.log("Log actualizado.");
  } catch (error) {
    console.error("Error al buscar aldeas inactivas:", error);
  } finally {
    // Cerrar el navegador
    await browser.close();
  }
}