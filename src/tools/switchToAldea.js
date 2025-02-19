// tools/switchToAldea.js
export async function switchToAldea(page, newdid) {
    const aldeaUrl = `${process.env.BASE_URL}/dorf1.php?newdid=${newdid}`;
    try {
      console.log(`Cambiando a la aldea con newdid: ${newdid}`);
      await page.goto(aldeaUrl, { timeout: 60000 });
    } catch (error) {
      console.error(`Error al cambiar a la aldea ${newdid}:`, error.message);
    }
  }
  