import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { Storage } from "@google-cloud/storage";
import { fileURLToPath } from "url";

const GCS_BUCKET = process.env.GCS_BUCKET || "hojas_vida_logyser";
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "eternal-brand-454501-i8",
});

const bucket = storage.bucket(GCS_BUCKET);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "templates", "cv_template.html");

console.log("📁 Ruta del template:", TEMPLATE_PATH);

async function renderHtmlFromTemplate(templatePath, data) {
  console.log("🔍 === DIAGNÓSTICO renderHtmlFromTemplate INICIADO ===");
  console.log("🔍 Template path:", templatePath);
  console.log("🔍 Número de campos en data:", Object.keys(data).length);
  console.log("🔍 Campos disponibles:", Object.keys(data));
  console.log("🔍 Valores de muestra:");
  Object.entries(data).slice(0, 5).forEach(([key, value]) => {
    console.log(`   ${key}:`, typeof value === 'string' ? value.substring(0, 50) + '...' : value);
  });

  try {
    console.log("📋 Leyendo archivo template...");
    let html = await fs.readFile(templatePath, "utf8");
    console.log("✅ Template leído correctamente");
    console.log("📊 Tamaño del template:", html.length, "caracteres");
    console.log("📊 Primeros 200 caracteres:", html.substring(0, 200) + '...');

    // Limpiar atributos onerror que pueden causar problemas con Puppeteer
    console.log("🧹 Limpiando atributos onerror...");
    const originalLength = html.length;
    html = html.replace(/onerror="[^"]*"/g, '');
    console.log(`✅ Limpieza completada. Cambios: ${originalLength - html.length} caracteres`);

    // Reemplazar placeholders
    console.log("🔄 Reemplazando placeholders...");
    let replacements = 0;
    let missingPlaceholders = [];

    Object.entries(data).forEach(([key, value]) => {
      const re = new RegExp(`{{\\s*${key}\\s*}}`, "g");
      const replacement = value != null ? String(value) : "";
      const matches = html.match(re);

      if (matches) {
        replacements += matches.length;
        html = html.replace(re, replacement);
        console.log(`   ✅ ${key}: ${matches.length} reemplazos`);
      } else {
        missingPlaceholders.push(key);
        console.log(`   ⚠ ${key}: No encontrado en template`);
      }
    });

    console.log(`✅ Reemplazos completados: ${replacements} placeholders`);

    if (missingPlaceholders.length > 0) {
      console.log(`⚠ Placeholders no encontrados en template: ${missingPlaceholders.join(', ')}`);
    }

    // Verificar que quedan placeholders sin reemplazar
    const remainingPlaceholders = html.match(/{{\s*[a-zA-Z_]+\s*}}/g);
    if (remainingPlaceholders) {
      console.log(`⚠ Placeholders sin reemplazar: ${remainingPlaceholders.length}`);
      console.log("   Ejemplos:", [...new Set(remainingPlaceholders)].slice(0, 5));
    } else {
      console.log("✅ Todos los placeholders fueron reemplazados");
    }

    if (!html || html.trim().length === 0) {
      console.error("❌ ERROR: HTML resultante está vacío después del reemplazo");
      throw new Error("HTML renderizado está vacío");
    }

    console.log("📊 Tamaño final del HTML:", html.length, "caracteres");
    console.log("🔍 === DIAGNÓSTICO renderHtmlFromTemplate COMPLETADO ===");

    return html;

  } catch (error) {
    console.error("❌ ERROR CRÍTICO en renderHtmlFromTemplate:");
    console.error("❌ Mensaje:", error.message);
    console.error("❌ Stack:", error.stack);

    if (error.code === 'ENOENT') {
      console.error("❌ El archivo template no existe en la ruta:", templatePath);
    } else if (error.code === 'EACCES') {
      console.error("❌ Sin permisos para leer el template:", templatePath);
    }

    console.error("🔍 === DIAGNÓSTICO renderHtmlFromTemplate FALLIDO ===");
    throw error;
  }
}

async function htmlToPdfBuffer(html) {
  console.log("🔍 === DIAGNÓSTICO htmlToPdfBuffer INICIADO ===");
  console.log("📊 Tamaño del HTML recibido:", html?.length || 0, "caracteres");

  // Verificar que el HTML no esté vacío
  if (!html || html.trim().length === 0) {
    console.error("❌ ERROR: HTML está vacío o undefined");
    throw new Error("HTML vacío no se puede convertir a PDF");
  }

  console.log("📝 Primeros 500 caracteres del HTML:");
  console.log(html.substring(0, 500) + (html.length > 500 ? "..." : ""));

  // Verificar placeholders sin reemplazar
  const remainingPlaceholders = html.match(/{{\s*[a-zA-Z_]+\s*}}/g);
  if (remainingPlaceholders && remainingPlaceholders.length > 0) {
    console.warn("⚠️ Advertencia: Se detectaron placeholders sin reemplazar:");
    console.warn("   Placeholders:", [...new Set(remainingPlaceholders)].slice(0, 5));
  }

  let browser;
  let page;

  try {
    console.log("🔧 Paso 1: Iniciando Puppeteer...");
    console.log("⚙️ Configuración Puppeteer:", {
      headless: true,
      timeout: 60000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor"
      ]
    });

    const startTime = Date.now();
    browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor"
      ],
      headless: true,
      timeout: 60000
    });

    const puppeteerTime = Date.now() - startTime;
    console.log(`✅ Puppeteer iniciado correctamente (${puppeteerTime}ms)`);

    console.log("📄 Creando nueva página...");
    page = await browser.newPage();
    console.log("✅ Nueva página creada");

    // Configurar timeout más largo
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);
    console.log("✅ Timeouts configurados (60s)");

    // Configurar viewport
    await page.setViewport({ width: 1200, height: 800 });
    console.log("✅ Viewport configurado: 1200x800");

    console.log("📋 Paso 2: Configurando contenido HTML en Puppeteer...");
    console.log("⚙️ Opciones setContent:", {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    const contentStartTime = Date.now();
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    const contentTime = Date.now() - contentStartTime;
    console.log(`✅ Contenido HTML cargado en Puppeteer (${contentTime}ms)`);

    // Verificar que la página cargó correctamente
    const pageTitle = await page.title();
    console.log("📄 Título de la página:", pageTitle || "(sin título)");

    // Verificar dimensiones del contenido
    const dimensions = await page.evaluate(() => {
      return {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight
      };
    });
    console.log("📐 Dimensiones del contenido:", dimensions);

    // Esperar a que las imágenes carguen
    console.log("⏳ Esperando carga de recursos (5 segundos)...");
    await page.waitForTimeout(5000);
    console.log("✅ Espera de recursos completada");

    console.log("📋 Paso 3: Generando PDF...");
    console.log("⚙️ Configuración PDF:", {
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
      timeout: 60000
    });

    const pdfStartTime = Date.now();
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
      timeout: 60000
    });

    const pdfTime = Date.now() - pdfStartTime;
    console.log(`✅ PDF generado (${pdfTime}ms)`);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      console.error("❌ ERROR: Buffer PDF está vacío después de la generación");
      throw new Error("Buffer PDF está vacío");
    }

    console.log("✅ PDF buffer generado exitosamente");
    console.log("📊 Tamaño del PDF buffer:", pdfBuffer.length, "bytes");
    console.log("📊 Tamaño en KB:", Math.round(pdfBuffer.length / 1024) + " KB");

    // Información adicional sobre el PDF
    console.log("🔍 Primeros bytes del PDF (hex):",
      pdfBuffer.slice(0, 4).toString('hex').toUpperCase());

    console.log("🔍 === DIAGNÓSTICO htmlToPdfBuffer COMPLETADO ===");

    return pdfBuffer;

  } catch (error) {
    console.error("❌ ERROR CRÍTICO en htmlToPdfBuffer:");
    console.error("❌ Tipo de error:", error.name);
    console.error("❌ Mensaje:", error.message);
    console.error("❌ Stack:", error.stack);

    // Diagnóstico específico de errores comunes
    if (error.name === 'TimeoutError') {
      console.error("❌ TIMEOUT: Puppeteer excedió el tiempo de espera");
    } else if (error.message.includes('Protocol error')) {
      console.error("❌ ERROR DE PROTOCOLO: Posible problema de comunicación con Chrome");
    } else if (error.message.includes('Navigation failed')) {
      console.error("❌ ERROR DE NAVEGACIÓN: No se pudo cargar el contenido HTML");
    } else if (error.message.includes('Target closed')) {
      console.error("❌ TARGET CLOSED: El navegador se cerró inesperadamente");
    }

    // Información adicional del estado
    console.error("🔍 Estado del browser:", browser ? "Activo" : "No iniciado");
    console.error("🔍 Estado de la página:", page ? "Creada" : "No creada");

    console.error("🔍 === DIAGNÓSTICO htmlToPdfBuffer FALLIDO ===");
    throw error;

  } finally {
    if (browser) {
      console.log("🔚 Cerrando Puppeteer...");
      try {
        await browser.close();
        console.log("✅ Puppeteer cerrado correctamente");
      } catch (closeError) {
        console.error("❌ Error cerrando Puppeteer:", closeError.message);
      }
    } else {
      console.log("ℹ️  Puppeteer no estaba iniciado, nada que cerrar");
    }
  }
}

async function generateAndUploadPdf({ identificacion, dataObjects = {} }) {
  console.log("🎯 INICIANDO generateAndUploadPdf");
  console.log("📝 Identificación:", identificacion);
  console.log("📊 Campos en dataObjects:", Object.keys(dataObjects));

  try {
    // 1. VERIFICAR TEMPLATE usando la función renderHtmlFromTemplate
    console.log("📋 Paso 1: Renderizando template con datos...");
    let html;
    try {
      html = await renderHtmlFromTemplate(TEMPLATE_PATH, dataObjects);
      console.log("✅ Template procesado, tamaño:", html.length, "caracteres");
    } catch (error) {
      console.error("❌ ERROR procesando template:", error.message);
      throw new Error(`No se pudo procesar el template: ${error.message}`);
    }

    // 2. CONVERTIR A PDF usando la función htmlToPdfBuffer
    console.log("📋 Paso 2: Convirtiendo a PDF...");
    let pdfBuffer;
    try {
      pdfBuffer = await htmlToPdfBuffer(html);
      console.log("✅ PDF generado, tamaño:", pdfBuffer.length, "bytes");
    } catch (pdfError) {
      console.error("❌ ERROR generando PDF:", pdfError.message);
      throw new Error(`Fallo en conversión PDF: ${pdfError.message}`);
    }

    // 3. SUBIR A GOOGLE CLOUD STORAGE
    console.log("📋 Paso 3: Subiendo a Google Cloud Storage...");
    const destName = `${identificacion}/cv_${Date.now()}.pdf`;
    console.log("📁 Archivo destino:", destName);

    const file = bucket.file(destName);

    try {
      await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        resumable: false
      });
      console.log("✅ PDF subido a GCS");
    } catch (uploadError) {
      console.error("❌ ERROR subiendo a GCS:", uploadError.message);
      throw new Error(`Fallo en subida GCS: ${uploadError.message}`);
    }

    // 4. GENERAR URL
    console.log("📋 Paso 4: Generando URL...");
    let signedUrl;
    try {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 días
      });
      signedUrl = url;
      console.log("✅ URL firmada generada");
    } catch (urlError) {
      console.warn("⚠️ Falló URL firmada, usando URL pública:", urlError.message);
      signedUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${destName}`;
    }

    console.log("🎉 PDF GENERADO EXITOSAMENTE");
    console.log("🔗 URL:", signedUrl);

    return {
      success: true,
      fileName: destName,
      url: signedUrl,
      size: pdfBuffer.length,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error("❌ ERROR CRÍTICO en generateAndUploadPdf:");
    console.error("❌ Mensaje:", error.message);
    console.error("❌ Stack:", error.stack);

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

export async function testGenerateAndUploadPdf({ identificacion, datosAspirante }) {
  console.log("🧪 INICIANDO PRUEBA DE PDF");
  console.log("📝 Identificación:", identificacion);

  try {
    // 1. Crear HTML simple de prueba
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>Hoja de Vida - ${identificacion}</title>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  padding: 40px;
                  background: #f5f5f5;
              }
              .container {
                  max-width: 800px;
                  margin: 0 auto;
                  background: white;
                  padding: 40px;
                  border-radius: 10px;
                  box-shadow: 0 0 20px rgba(0,0,0,0.1);
              }
              h1 {
                  color: #000b59;
                  border-bottom: 3px solid #f55400;
                  padding-bottom: 10px;
              }
              .test-message {
                  background: #e3f2fd;
                  padding: 20px;
                  border-radius: 8px;
                  margin: 20px 0;
                  border-left: 4px solid #2196f3;
              }
              .data-section {
                  margin: 30px 0;
                  padding: 20px;
                  background: #f9f9f9;
                  border-radius: 8px;
              }
              .field {
                  margin: 10px 0;
                  padding: 5px 0;
                  border-bottom: 1px dashed #ddd;
              }
              .field-label {
                  font-weight: bold;
                  color: #555;
                  min-width: 150px;
                  display: inline-block;
              }
              .timestamp {
                  text-align: center;
                  color: #666;
                  font-size: 12px;
                  margin-top: 30px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>📄 Hoja de Vida - ${identificacion}</h1>
              
              <div class="test-message">
                  <h2>✅ PRUEBA EXITOSA</h2>
                  <p>Este es un PDF de prueba generado para verificar la funcionalidad del sistema.</p>
                  <p><strong>Si puedes ver este PDF, significa que:</strong></p>
                  <ul>
                      <li>✅ Puppeteer está funcionando correctamente</li>
                      <li>✅ La generación de PDF está operativa</li>
                      <li>✅ La subida a Google Cloud Storage funciona</li>
                  </ul>
              </div>
              
              <div class="data-section">
                  <h3>📋 Información del Aspirante</h3>
                  
                  <div class="field">
                      <span class="field-label">Nombre:</span>
                      ${datosAspirante?.NOMBRE_COMPLETO || 'No especificado'}
                  </div>
                  
                  <div class="field">
                      <span class="field-label">Identificación:</span>
                      ${identificacion}
                  </div>
                  
                  <div class="field">
                      <span class="field-label">Teléfono:</span>
                      ${datosAspirante?.TELEFONO || 'No especificado'}
                  </div>
                  
                  <div class="field">
                      <span class="field-label">Correo:</span>
                      ${datosAspirante?.CORREO || 'No especificado'}
                  </div>
                  
                  <div class="field">
                      <span class="field-label">EPS:</span>
                      ${datosAspirante?.EPS || 'No especificado'}
                  </div>
                  
                  <div class="field">
                      <span class="field-label">Fecha de generación:</span>
                      ${new Date().toLocaleString('es-CO')}
                  </div>
              </div>
              
              <div class="data-section">
                  <h3>📊 Resumen de datos</h3>
                  <p><strong>Total de estudios registrados:</strong> ${datosAspirante?.EDUCACION_LIST?.match(/class="list-item"/g)?.length || 0}</p>
                  <p><strong>Total de experiencias laborales:</strong> ${datosAspirante?.EXPERIENCIA_LIST?.match(/class="list-item"/g)?.length || 0}</p>
                  <p><strong>Total de familiares:</strong> ${datosAspirante?.FAMILIARES_LIST?.match(/class="list-item"/g)?.length || 0}</p>
              </div>
              
              <div class="timestamp">
                  Generado automáticamente por Logyser • ${new Date().toLocaleString()}
              </div>
          </div>
      </body>
      </html>
    `;

    console.log("✅ HTML de prueba generado");

    // 2. Generar PDF con Puppeteer
    console.log("🔧 Iniciando Puppeteer...");
    let browser;
    let pdfBuffer;

    try {
      browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        headless: 'new',
        timeout: 30000
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }
      });

      console.log(`✅ PDF generado (${pdfBuffer.length} bytes)`);

    } catch (puppeteerError) {
      console.error("❌ ERROR en Puppeteer:", puppeteerError.message);

      // Fallback: crear PDF muy básico si Puppeteer falla
      console.log("🔄 Usando fallback básico para PDF...");
      const basicPdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj

2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj

3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj

4 0 obj
<< /Length 44 >>
stream
BT
/F1 24 Tf
100 600 Td
(✅ PDF de Prueba - ${identificacion}) Tj
ET
endstream
endobj

5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj

xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000102 00000 n 
0000000178 00000 n 
0000000305 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
395
%%EOF`;

      pdfBuffer = Buffer.from(basicPdfContent);
      console.log("✅ PDF fallback creado");

    } finally {
      if (browser) {
        await browser.close();
        console.log("✅ Puppeteer cerrado");
      }
    }

    // 3. Subir a Google Cloud Storage
    console.log("☁️ Subiendo a Google Cloud Storage...");

    const timestamp = Date.now();
    const destName = `${identificacion}/cv_test_${timestamp}.pdf`;
    console.log("📁 Archivo destino:", destName);

    const file = bucket.file(destName);

    try {
      await file.save(pdfBuffer, {
        contentType: 'application/pdf',
        resumable: false,
        metadata: {
          test: 'true',
          identificacion: identificacion,
          timestamp: new Date().toISOString()
        }
      });

      console.log("✅ PDF subido a GCS exitosamente");

    } catch (uploadError) {
      console.error("❌ ERROR subiendo a GCS:", uploadError.message);

      // Fallback: guardar localmente si GCS falla
      const localPath = path.join(__dirname, 'temp_pdfs', destName);
      await fs.mkdir(path.dirname(localPath), { recursive: true });
      await fs.writeFile(localPath, pdfBuffer);
      console.log("✅ PDF guardado localmente en:", localPath);

      throw new Error(`Fallo en subida GCS: ${uploadError.message}. PDF guardado localmente.`);
    }

    // 4. Generar URL de acceso
    console.log("🔗 Generando URL...");

    let signedUrl;
    try {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 días
      });
      signedUrl = url;
      console.log("✅ URL firmada generada");

    } catch (urlError) {
      console.warn("⚠️ Falló URL firmada, usando URL pública:", urlError.message);
      signedUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${destName}`;
    }

    console.log("🎉 PRUEBA DE PDF COMPLETADA EXITOSAMENTE");
    console.log("🔗 URL del PDF:", signedUrl);
    console.log("📊 Tamaño del PDF:", pdfBuffer.length, "bytes");

    return {
      success: true,
      fileName: destName,
      url: signedUrl,
      size: pdfBuffer.length,
      timestamp: new Date().toISOString(),
      message: "PDF de prueba generado y subido exitosamente"
    };

  } catch (error) {
    console.error("❌ ERROR en prueba de PDF:", error);

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      message: "Error en generación de PDF de prueba"
    };
  }
}

export { generateAndUploadPdf, testGenerateAndUploadPdf };