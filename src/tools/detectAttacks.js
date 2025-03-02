// tools/detectAttacks.js
export async function detectAttacks(page) {
  const dorf1Url = `${process.env.BASE_URL}/dorf1.php`;
  console.log("Verificando ataques en la página principal...");

  try {
    // // Navegar a la página principal (dorf1.php)
    // await page.goto(dorf1Url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Extraer información de los ataques
    const attacks = await page.$$eval('#movements tr', (rows) => {
      const attackRows = rows.filter(row => {
        const icon = row.querySelector('img.att1'); // Icono de ataques entrantes
        return icon !== null;
      });

      // Agrupar la información de cada ataque
      const attacks = [];
      for (let i = 0; i < attackRows.length; i++) {
        const row = attackRows[i];
        const count = row.querySelector('span.a1')?.textContent.trim() || 'Desconocido';
        const timeLeft = row.querySelector('span.timer')?.textContent.trim() || 'Desconocido';
        attacks.push({ count, timeLeft });
      }

      return attacks;
    });

    if (attacks.length === 0) {
      console.log("No hay ataques en curso.");
      return []; // No hay ataques
    }

    console.log(`Se detectaron ${attacks.length} ataques en curso.`);
    return attacks;
  } catch (error) {
    console.error(`Error al detectar ataques: ${error.message}`);
    return []; // Retornar un array vacío en caso de error
  }
}