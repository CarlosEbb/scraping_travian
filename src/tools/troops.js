// tools/troops.js
export async function createTroops(page, type) {
  try {
    // Determinar la URL según el tipo de tropa
    let troopUrl = "";
    if (type === "t1" || type === "t2" || type === "t3") {
      troopUrl = `${process.env.BASE_URL}/build.php?id=31&gid=19`; // Para t1 y t2
    } else if(type === "t7" || type === "t8"){
      troopUrl = `${process.env.BASE_URL}/build.php?id=22&gid=21`; // Para cualquier otro tipo
    }else {
      troopUrl = `${process.env.BASE_URL}/build.php?id=29&gid=20`; // Para cualquier otro tipo
    }

    // Navegar a la página de creación de tropas
    console.log(`Accediendo a la página de creación de tropas: ${troopUrl}`);
    await page.goto(troopUrl, { timeout: 60000 });

    // Cambiar el valor del input directamente
    const troopInputSelector = `input[name='${type}']`; // Selector para el tipo de tropa
    console.log(`Cambiando el valor del input para ${type} a 20...`);
    await page.waitForSelector(troopInputSelector, { timeout: 10000 });

    // Establecer el valor en 20 (para crear 20 tropas)
    await page.evaluate((selector) => {
      const input = document.querySelector(selector);
      if (input) input.value = 200;
    }, troopInputSelector);

    // Enviar el formulario
    const submitButtonSelector = "button[name='s1'].startTraining";
    console.log("Enviando el formulario para crear tropas...");
    await page.waitForSelector(submitButtonSelector, { timeout: 10000 });
    await page.click(submitButtonSelector);

    console.log("Tropas creadas exitosamente.");
  } catch (error) {
    console.error("Error creando tropas:", error.message);
  }
}
