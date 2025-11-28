import fs from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { Storage } from "@google-cloud/storage";
import { fileURLToPath } from "url";

const GCS_BUCKET = process.env.GCS_BUCKET || "hojas_vida_logyser";
const LOGO_GCS_BUCKET = process.env.LOGO_GCS_BUCKET || "logyser-public"; // bucket donde está el logo
const LOGO_GCS_PATH = process.env.LOGO_GCS_PATH || "logo/logyser_horizontal.png"; // ruta dentro del bucket
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || "eternal-brand-454501-i8",
});

const bucket = storage.bucket(GCS_BUCKET);

// Resolve template path relative to this module (robusto en dev/contener)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.join(__dirname, "templates", "cv_template.html");

// helper: load template file and replace placeholders
async function renderHtmlFromTemplate(templatePath, data) {
  let html = await fs.readFile(templatePath, "utf8");
  // Simple placeholder replacement: {{KEY}}
  Object.entries(data).forEach(([k, v]) => {
    const re = new RegExp(`{{\\s*${k}\\s*}}`, "g");
    html = html.replace(re, v != null ? String(v) : "");
  });
  return html;
}

// helper: try to download logo from GCS and return data URL, otherwise return public URL fallback
async function getLogoDataUrl() {
  try {
    const logoBucket = storage.bucket(LOGO_GCS_BUCKET);
    const logoFile = logoBucket.file(LOGO_GCS_PATH);

    // comprobar existencia
    const [exists] = await logoFile.exists();
    if (exists) {
      const [buffer] = await logoFile.download();
      // intentar metadata para contentType
      let contentType = "image/png";
      try {
        const [meta] = await logoFile.getMetadata();
        if (meta && meta.contentType) contentType = meta.contentType;
      } catch (errMeta) {
        // ignore
      }
      const base64 = buffer.toString("base64");
      return `data:${contentType};base64,${base64}`;
    }
  } catch (err) {
    console.warn("No se pudo descargar logo desde GCS:", err && err.message ? err.message : err);
  }

  // fallback público
  return `https://storage.googleapis.com/${LOGO_GCS_BUCKET}/${LOGO_GCS_PATH}`;
}

async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" }
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

export async function generateAndUploadPdf({ identificacion, dataObjects = {}, destNamePrefix }) {
  // Asegurar que LOGO_URL esté disponible en dataObjects — preferir valor pasado por caller
  // if (!dataObjects.LOGO_URL) {
  //    dataObjects.LOGO_URL = await getLogoDataUrl();
  // }

  // NO sobreescribir LOGO_URL; server.js ya manda la correcta
    if (!dataObjects.LOGO_URL) {
        dataObjects.LOGO_URL = "https://storage.googleapis.com/logyser-recibo-public/logo.png";
    }


  const templatePath = TEMPLATE_PATH;
  const html = await renderHtmlFromTemplate(templatePath, dataObjects);
  const pdfBuffer = await htmlToPdfBuffer(html);

  const destName = `${identificacion}/${destNamePrefix || "cv"}_${Date.now()}.pdf`;
  const file = bucket.file(destName);

  await file.save(pdfBuffer, {
    contentType: "application/pdf",
    resumable: false
  });

  const expiresMs = parseInt(process.env.SIGNED_URL_EXPIRES_MS || String(7 * 24 * 60 * 60 * 1000), 10);
  const expiresAt = Date.now() + expiresMs;
  let signedUrl = null;
  try {
    const [url] = await file.getSignedUrl({ action: "read", expires: expiresAt });
    signedUrl = url;
  } catch (err) {
    console.warn("pdf getSignedUrl falló:", err && err.message ? err.message : err);
    signedUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${destName}`;
  }

  return { destName, signedUrl };
}