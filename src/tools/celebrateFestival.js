// tools/celebrateFestival.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtener el directorio actual usando import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para convertir el tiempo a milisegundos
function convertToMilliseconds(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(num => parseInt(num, 10));
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

// Función principal para realizar la fiesta
// tools/celebrateFestival.js
export async function celebrateFestival(page, aldea, tipo = 1) {
    const logFilePath = path.join(__dirname, '..', 'temporal', `log_${aldea.name}_festival.json`);
    let festivalLogData = {};
  
    // Leer o crear el log de fiestas
    if (fs.existsSync(logFilePath)) {
      festivalLogData = JSON.parse(fs.readFileSync(logFilePath, 'utf8'));
    } else {
      fs.writeFileSync(logFilePath, JSON.stringify({}, null, 2));
    }
  
    // // Verificar si ya hay una fiesta en progreso
    // const inProgress = Object.values(festivalLogData).some(time => new Date(time) > new Date());
    // if (inProgress) {
    //   console.log("Ya hay una fiesta en progreso. Esperando...");
    //   return { hasFestivalInProgress: true }; // Devolver estado de fiestas
    // }
    let finaltipo = 1
    if(tipo != 1 && tipo != 2){
      finaltipo = 1;
    }else{
      finaltipo = tipo;
    }

    try {
      // Visitar la URL directa de la fiesta grande
      const festivalUrl = `${process.env.BASE_URL}/build.php?gid=24&action=celebration&do=${finaltipo}&t=1`;
      console.log(`Iniciando fiesta grande en la aldea ${aldea.name}...`);
      await page.goto(festivalUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  
      // Verificar si la fiesta se inició correctamente
      const festivalTableSelector = 'table.under_progress';
      const hasFestivalInProgress = await page.$(festivalTableSelector) !== null;
  
      if (hasFestivalInProgress) {
        console.log("Fiesta grande iniciada correctamente.");
  
        // Extraer el tiempo restante de la última fiesta en la tabla
        const lastFestivalTime = await page.$eval(
          `${festivalTableSelector} tbody tr:last-child td.dur span.timer`,
          (span) => span.textContent
        );
  
        // Calcular el tiempo de finalización
        const currentTime = new Date();
        const completionTime = new Date(currentTime.getTime() + convertToMilliseconds(lastFestivalTime));
  
        // Guardar en el log
        festivalLogData["fiesta_grande"] = completionTime.toISOString();
        fs.writeFileSync(logFilePath, JSON.stringify(festivalLogData, null, 2));
  
        console.log(`Fiesta grande iniciada. Tiempo estimado de finalización: ${completionTime}`);
        return { hasFestivalInProgress: true }; // Devolver estado de fiestas
      } else {
        console.log("No se pudo iniciar la fiesta grande. Verifica si hay suficientes recursos.");
        return { hasFestivalInProgress: false }; // Devolver estado de fiestas
      }
    } catch (error) {
      console.error(`Error al realizar la fiesta: ${error.message}`);
      return { hasFestivalInProgress: false }; // Devolver estado de fiestas en caso de error
    }
  }