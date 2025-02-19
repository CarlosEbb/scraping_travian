import fs from 'fs';
import path from 'path';

const COOKIE_FILE = "../temporal/cookie.json";
const COOKIE_LOG_FILE = "../temporal/cookie_log.json";

// Crear la carpeta temporal si no existe
const temporalDir = path.dirname(COOKIE_FILE);
if (!fs.existsSync(temporalDir)) {
  fs.mkdirSync(temporalDir, { recursive: true });
  console.log("Carpeta 'temporal' creada.");
}

function areCookiesExpired() {
  if (fs.existsSync(COOKIE_LOG_FILE)) {
    const logData = JSON.parse(fs.readFileSync(COOKIE_LOG_FILE, "utf8"));
    const cookieCreatedAt = new Date(logData.createdAt);
    const now = new Date();
    const diffMinutes = (now - cookieCreatedAt) / 60000;
    return diffMinutes > 30;
  }
  return true;
}

export async function manageCookies(page, loginUrl, username, password) {
  if (fs.existsSync(COOKIE_FILE) && !areCookiesExpired()) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf8"));
    await page.setCookie(...cookies);
    console.log("Cookies cargadas.");
  } else {
    console.log("Generando nuevas cookies...");
    await page.goto(loginUrl);
    if (await page.$("input[name='name']")) {
      console.log("Iniciando sesión...");
      await page.evaluate((username, password) => {
        document.querySelector("input[name='name']").value = username;
        document.querySelector("input[name='password']").value = password;
        document.querySelector("button[type='submit']").click();
      }, username, password);

      await page.waitForNavigation({ timeout: 60000 });
      console.log("Sesión iniciada.");

      const cookies = await page.cookies();
      fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));
      console.log("Cookies guardadas.");

      const logData = { createdAt: new Date().toISOString() };
      fs.writeFileSync(COOKIE_LOG_FILE, JSON.stringify(logData, null, 2));
      console.log("Log de cookies actualizado.");
    }
  }
}
