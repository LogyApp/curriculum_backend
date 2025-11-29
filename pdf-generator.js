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

  // Validaciones críticas
  if (!identificacion) {
    throw new Error("Identificación es requerida para generar PDF");
  }

  try {
    // 1. Verificar template
    console.log("📋 Paso 1: Verificando template...");
    try {
      await fs.access(TEMPLATE_PATH);
      console.log("✅ Template encontrado");
    } catch (err) {
      console.error("❌ Template no encontrado:", TEMPLATE_PATH);
      throw new Error(`Template no encontrado: ${TEMPLATE_PATH}`);
    }

    // 2. Asegurar LOGO_URL
    console.log("📋 Paso 2: Configurando logo...");
    if (!dataObjects.LOGO_URL) {
      dataObjects.LOGO_URL = "https://storage.googleapis.com/logyser-recibo-public/logo.png";
    }
    console.log("✅ Logo URL:", dataObjects.LOGO_URL);

    // 3. Renderizar HTML
    console.log("📋 Paso 3: Renderizando HTML...");
    const html = await renderHtmlFromTemplate(TEMPLATE_PATH, dataObjects);

    if (!html || html.trim().length === 0) {
      throw new Error("HTML renderizado está vacío");
    }

    // Guardar HTML temporal para debugging (opcional)
    // await fs.writeFile("/tmp/debug_html.html", html);

    // 4. Convertir a PDF
    console.log("📋 Paso 4: Convirtiendo a PDF...");
    const pdfBuffer = await htmlToPdfBuffer(html);

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error("Buffer PDF está vacío");
    }

    // 5. Subir a GCS
    console.log("📋 Paso 5: Subiendo a Google Cloud Storage...");
    const destName = `${identificacion}/${destNamePrefix}_${Date.now()}.pdf`;
    console.log("📁 Destino GCS:", destName);

    const file = bucket.file(destName);

    await file.save(pdfBuffer, {
      contentType: "application/pdf",
      resumable: false
    });

    console.log("✅ PDF subido a GCS correctamente");

    // 6. Generar URL firmada
    console.log("📋 Paso 6: Generando URL firmada...");
    const expiresMs = parseInt(process.env.SIGNED_URL_EXPIRES_MS || String(7 * 24 * 60 * 60 * 1000), 10);

    let signedUrl = null;
    try {
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + expiresMs
      });
      signedUrl = url;
      console.log("✅ Signed URL generada para PDF");
    } catch (err) {
      console.warn("⚠ getSignedUrl falló, usando URL pública:", err.message);
      signedUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${destName}`;
    }

    console.log("🎉 PDF generado y subido exitosamente");
    return { destName, signedUrl };

  } catch (error) {
    console.error("❌ ERROR CRÍTICO en generateAndUploadPdf:", error.message);
    console.error("❌ Stack trace:", error.stack);
    throw error;
  }
}