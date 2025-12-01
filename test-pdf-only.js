// test-pdf-only.js
import { testGenerateAndUploadPdf } from './pdf-generator-test.js';

async function runTest() {
    console.log("🧪 EJECUTANDO PRUEBA INDEPENDIENTE DE PDF");

    const testData = {
        identificacion: `test_${Date.now()}`,
        datosAspirante: {
            NOMBRE_COMPLETO: "Juan Pérez de Prueba",
            TELEFONO: "3001234567",
            CORREO: "prueba@logyser.com",
            EPS: "SURA",
            EDUCACION_LIST: '<div class="list-item">Estudio 1</div><div class="list-item">Estudio 2</div>',
            EXPERIENCIA_LIST: '<div class="list-item">Experiencia 1</div>',
            FAMILIARES_LIST: '<div class="list-item">Familiar 1</div><div class="list-item">Familiar 2</div>'
        }
    };

    console.log("📝 Datos de prueba:", testData);

    const result = await testGenerateAndUploadPdf(testData);

    console.log("📊 Resultado de la prueba:");
    console.log(JSON.stringify(result, null, 2));

    if (result.success) {
        console.log("✅ ¡PRUEBA EXITOSA! El PDF se generó y subió correctamente.");
        console.log("🔗 Accede al PDF en:", result.url);
        process.exit(0);
    } else {
        console.error("❌ PRUEBA FALLIDA:", result.error);
        process.exit(1);
    }
}

// Ejecutar prueba
runTest().catch(console.error);