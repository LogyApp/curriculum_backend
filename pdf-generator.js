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
  console.log("🔧 Renderizando HTML con datos:", Object.keys(data));

  try {
    let html = await fs.readFile(templatePath, "utf8");
    console.log("✅ Template leído correctamente, tamaño:", html.length, "caracteres");

    // Limpiar atributos onerror que pueden causar problemas con Puppeteer
    html = html.replace(/onerror="[^"]*"/g, '');

    // Reemplazar placeholders
    let replacements = 0;
    Object.entries(data).forEach(([k, v]) => {
      const re = new RegExp(`{{\\s*${k}\\s*}}`, "g");
      const replacement = v != null ? String(v) : "";
      const matches = html.match(re);
      if (matches) {
        replacements += matches.length;
        html = html.replace(re, replacement);
      }
    });

    console.log(`✅ Reemplazados ${replacements} placeholders`);
    return html;
  } catch (error) {
    console.error("❌ Error leyendo template:", error.message);
    throw error;
  }
}

async function htmlToPdfBuffer(html) {
  console.log("🖨️ Iniciando conversión HTML a PDF...");

  let browser;
  try {
    console.log("🔧 Iniciando Puppeteer...");
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

    const page = await browser.newPage();
    console.log("✅ Puppeteer iniciado correctamente");

    // Configurar timeout más largo
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);

    // Configurar viewport
    await page.setViewport({ width: 1200, height: 800 });

    console.log("📄 Configurando contenido HTML...");

    // Usar setContent con opciones más permisivas
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 60000
    });

    console.log("✅ Contenido HTML cargado en Puppeteer");

    // Esperar a que las imágenes carguen
    await page.waitForTimeout(5000);

    console.log("📊 Generando PDF buffer...");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
      timeout: 60000
    });

    console.log("✅ PDF buffer generado, tamaño:", pdfBuffer.length, "bytes");
    return pdfBuffer;

  } catch (error) {
    console.error("❌ Error en htmlToPdfBuffer:", error.message);
    console.error("❌ Stack:", error.stack);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log("🔚 Puppeteer cerrado");
    }
  }
}

export async function generateAndUploadPdf({ identificacion, dataObjects = {}, destNamePrefix = "hoja_vida" }) {
  console.log("🚀 INICIANDO generateAndUploadPdf para:", identificacion);
  console.log("📊 Datos recibidos - Keys:", Object.keys(dataObjects));
  console.log("📊 Identificación:", identificacion);

  // Validaciones críticas mejoradas
  if (!identificacion || identificacion.trim() === "") {
    const error = new Error("Identificación es requerida y no puede estar vacía para generar PDF");
    console.error("❌ Validación fallida:", error.message);
    throw error;
  }

  if (Object.keys(dataObjects).length === 0) {
    console.warn("⚠ Advertencia: dataObjects está vacío, se generará PDF con datos mínimos");
  }

  try {
    // 1. Verificar template con mejor manejo de errores
    console.log("📋 Paso 1: Verificando template...");
    console.log("📁 Ruta del template:", TEMPLATE_PATH);

    try {
      const templateStats = await fs.stat(TEMPLATE_PATH);
      console.log("✅ Template encontrado, tamaño:", templateStats.size, "bytes");
    } catch (err) {
      console.error("❌ Template no encontrado o inaccesible:", TEMPLATE_PATH);
      console.error("❌ Error del sistema:", err.message);
      throw new Error(`Template no encontrado en: ${TEMPLATE_PATH}. Verifica la ruta y permisos.`);
    }

    // 2. Asegurar datos mínimos para el template
    console.log("📋 Paso 2: Configurando datos mínimos...");

    // Datos mínimos requeridos
    const datosMinimos = {
      LOGO_URL: dataObjects.LOGO_URL || "https://storage.googleapis.com/logyser-recibo-public/logo.png",
      NOMBRE_COMPLETO: dataObjects.NOMBRE_COMPLETO || "Nombre no especificado",
      IDENTIFICACION: dataObjects.IDENTIFICACION || identificacion,
      FECHA_GENERACION: dataObjects.FECHA_GENERACION || new Date().toLocaleString(),
      EDUCACION_LIST: dataObjects.EDUCACION_LIST || "<div class='small'>No registrado</div>",
      EXPERIENCIA_LIST: dataObjects.EXPERIENCIA_LIST || "<div class='small'>No registrado</div>",
      REFERENCIAS_LIST: dataObjects.REFERENCIAS_LIST || "<div class='small'>No registrado</div>",
      FAMILIARES_LIST: dataObjects.FAMILIARES_LIST || "<div class='small'>No registrado</div>",
      CONTACTO_EMERGENCIA: dataObjects.CONTACTO_EMERGENCIA || "No registrado",
      METAS: dataObjects.METAS || "<div class='small'>No registrado</div>"
    };

    // Combinar con dataObjects proporcionados
    const datosCompletos = { ...datosMinimos, ...dataObjects };
    console.log("✅ Datos configurados, total de campos:", Object.keys(datosCompletos).length);

    // 3. Renderizar HTML con mejor manejo de errores
    console.log("📋 Paso 3: Renderizando HTML...");
    let html;
    try {
      html = await renderHtmlFromTemplate(TEMPLATE_PATH, datosCompletos);

      if (!html || html.trim().length === 0) {
        throw new Error("HTML renderizado está vacío después del procesamiento");
      }

      console.log("✅ HTML renderizado correctamente, tamaño:", html.length, "caracteres");

      // Debug: Guardar HTML temporal si está en entorno de desarrollo
      if (process.env.NODE_ENV === 'development') {
        const debugPath = `/tmp/debug_${identificacion}_${Date.now()}.html`;
        await fs.writeFile(debugPath, html);
        console.log("📝 HTML guardado para debug:", debugPath);
      }

    } catch (renderError) {
      console.error("❌ Error renderizando HTML:", renderError.message);
      throw new Error(`Fallo en renderizado HTML: ${renderError.message}`);
    }

    // 4. Convertir a PDF con timeout y reintentos
    console.log("📋 Paso 4: Convirtiendo HTML a PDF...");
    let pdfBuffer;
    try {
      pdfBuffer = await htmlToPdfBuffer(html);

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error("Buffer PDF está vacío después de la conversión");
      }

      console.log("✅ PDF convertido correctamente, tamaño:", pdfBuffer.length, "bytes");

    } catch (conversionError) {
      console.error("❌ Error en conversión PDF:", conversionError.message);
      throw new Error(`Fallo en conversión PDF: ${conversionError.message}`);
    }

    // 5. Subir a GCS con validación de bucket
    console.log("📋 Paso 5: Subiendo a Google Cloud Storage...");

    // Validar que el bucket existe
    try {
      const [bucketExists] = await bucket.exists();
      if (!bucketExists) {
        throw new Error(`Bucket ${GCS_BUCKET} no existe o no es accesible`);
      }
      console.log("✅ Bucket verificado:", GCS_BUCKET);
    } catch (bucketError) {
      console.error("❌ Error accediendo al bucket:", bucketError.message);
      throw new Error(`Bucket no disponible: ${bucketError.message}`);
    }

    const destName = `${identificacion}/${destNamePrefix}_${Date.now()}.pdf`;
    console.log("📁 Destino GCS:", destName);

    const file = bucket.file(destName);

    try {
      await file.save(pdfBuffer, {
        contentType: "application/pdf",
        resumable: false,
        metadata: {
          created: new Date().toISOString(),
          identificacion: identificacion,
          source: 'hv-system'
        }
      });
      console.log("✅ PDF subido a GCS correctamente");

      // Verificar que el archivo se subió correctamente
      const [fileExists] = await file.exists();
      if (!fileExists) {
        throw new Error("El archivo no se encuentra en GCS después de la subida");
      }
      console.log("✅ Verificación de archivo en GCS: EXITOSA");

    } catch (uploadError) {
      console.error("❌ Error subiendo a GCS:", uploadError.message);
      throw new Error(`Fallo en subida a GCS: ${uploadError.message}`);
    }

    // 6. Generar URL firmada con fallback robusto
    console.log("📋 Paso 6: Generando URL firmada...");
    const expiresMs = parseInt(process.env.SIGNED_URL_EXPIRES_MS || String(7 * 24 * 60 * 60 * 1000), 10);
    console.log("⏰ URL expira en:", Math.round(expiresMs / (24 * 60 * 60 * 1000)), "días");

    let signedUrl = null;
    try {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: "read",
        expires: Date.now() + expiresMs
      });
      signedUrl = url;
      console.log("✅ Signed URL generada correctamente");
      console.log("🔗 URL length:", signedUrl.length);

    } catch (signedUrlError) {
      console.warn("⚠ getSignedUrl falló:", signedUrlError.message);
      console.log("🔄 Usando URL pública como fallback...");

      // Fallback a URL pública
      signedUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${destName}`;
      console.log("🔗 URL pública fallback:", signedUrl);
    }

    // Validación final del resultado
    if (!signedUrl || signedUrl.trim() === "") {
      throw new Error("No se pudo generar ninguna URL válida para el PDF");
    }

    console.log("🎉 PDF generado y subido EXITOSAMENTE");
    console.log("📊 Resumen:");
    console.log("   📁 Destino:", destName);
    console.log("   🔗 URL:", signedUrl.substring(0, 100) + "...");
    console.log("   👤 Identificación:", identificacion);
    console.log("   ⏰ Generado:", new Date().toISOString());

    return {
      destName,
      signedUrl,
      timestamp: new Date().toISOString(),
      size: pdfBuffer.length
    };

  } catch (error) {
    console.error("❌ ERROR CRÍTICO en generateAndUploadPdf:");
    console.error("❌ Mensaje:", error.message);
    console.error("❌ Stack trace:", error.stack);
    console.error("❌ Identificación:", identificacion);
    console.error("❌ Timestamp:", new Date().toISOString());

    // Propagar el error con más contexto
    const enhancedError = new Error(`Fallo en generación de PDF para ${identificacion}: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.identificacion = identificacion;
    throw enhancedError;
  }
}