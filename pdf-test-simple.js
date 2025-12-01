// pdf-test-simple.js
import { Storage } from "@google-cloud/storage";
import fs from "fs/promises";
import path from "path";

const GCS_BUCKET = process.env.GCS_BUCKET || "hojas_vida_logyser";
const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || "eternal-brand-454501-i8",
});
const bucket = storage.bucket(GCS_BUCKET);

// Función SUPER simple para crear un PDF vacío y subirlo
async function uploadSimplePdf(identificacion) {
    console.log("📄 Creando PDF simple para:", identificacion);

    try {
        // 1. Crear un PDF MUY básico (solo texto mínimo)
        const pdfContent = `%PDF-1.4
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
<< /Length 73 >>
stream
BT
/F1 24 Tf
100 600 Td
(Hoja de Vida - ${identificacion}) Tj
0 -50 Td
(Fecha: ${new Date().toLocaleDateString()}) Tj
0 -50 Td
(Logyser - Prueba de PDF) Tj
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
418
%%EOF`;

        const pdfBuffer = Buffer.from(pdfContent);
        console.log("✅ PDF básico creado:", pdfBuffer.length, "bytes");

        // 2. Subir a Google Cloud Storage
        const timestamp = Date.now();
        const fileName = `${identificacion}/cv_simple_${timestamp}.pdf`;

        console.log("📤 Subiendo a GCS:", fileName);

        const file = bucket.file(fileName);
        await file.save(pdfBuffer, {
            contentType: 'application/pdf',
            resumable: false,
            metadata: {
                test: 'true',
                identificacion: identificacion,
                timestamp: new Date().toISOString()
            }
        });

        console.log("✅ PDF subido a GCS");

        // 3. Generar URL pública (sin signed URL para simplificar)
        const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${fileName}`;

        console.log("🔗 URL pública:", publicUrl);

        return {
            success: true,
            message: "PDF simple subido exitosamente",
            fileName: fileName,
            url: publicUrl,
            size: pdfBuffer.length,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error("❌ ERROR en uploadSimplePdf:", error);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

export { uploadSimplePdf };