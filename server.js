
// Importar tu función de generación de PDF
import { generateAndUploadPdf } from "./pdf-generator.js";

import multer from "multer";
import { Storage } from "@google-cloud/storage";

import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";

import path from "path";
import { fileURLToPath } from "url";

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.Router())
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

import correoAspiranteRoutes from "./router/correoAspirante.js";

// === Servir frontend ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ==========================================
//  CONEXIÓN A MYSQL
// ==========================================

const pool = mysql.createPool({
  host: process.env.DB_HOST || '34.162.109.112',
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || 'Logyser2025',
  database: "Desplegables",
  port: 3307,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Helper para consultas
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Helper: escape HTML para textos que iremos inyectando en la plantilla
function escapeHtml(str = "") {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// Multer: almacenar en memoria para subir directamente a GCS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // límite 5MB (ajusta si quieres)
});

// Google Cloud Storage
const GCS_BUCKET = process.env.GCS_BUCKET || "hojas_vida_logyser";
const storageGcs = new Storage(); // usará credenciales por env/Workload Identity en GCP
const bucket = storageGcs.bucket(GCS_BUCKET);

// Preparar datos reales
// Agregar esta función después de las importaciones y antes de los endpoints

function prepareDataForPdfTemplate(datosAspirante) {
  console.log("🔄 Preparando datos para template PDF...");

  const {
    tipo_documento,
    identificacion,
    primer_nombre,
    segundo_nombre,
    primer_apellido,
    segundo_apellido,
    fecha_nacimiento,
    edad,
    departamento_expedicion,
    ciudad_expedicion,
    fecha_expedicion,
    estado_civil,
    direccion_barrio,
    departamento_residencia,
    ciudad_residencia,
    telefono,
    correo_electronico,
    eps,
    afp,
    rh,
    talla_pantalon,
    camisa_talla,
    zapatos_talla,
    foto_public_url
  } = datosAspirante;

  // Nombre completo
  const nombreCompleto = [
    primer_nombre,
    segundo_nombre,
    primer_apellido,
    segundo_apellido
  ].filter(Boolean).join(' ');

  // Ciudad de residencia
  const ciudadResidencia = ciudad_residencia ?
    `${ciudad_residencia}, ${departamento_residencia}` :
    (departamento_residencia || '');

  // Transformar arrays a HTML formateado
  const formatListToHtml = (items, fields) => {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return '<div class="list-item">No registrado</div>';
    }

    return items.map((item, index) => {
      const lines = [];
      fields.forEach(field => {
        if (item[field]) {
          lines.push(`${field}: ${item[field]}`);
        }
      });

      return `<div class="list-item">
                <div class="list-item-title">${index + 1}. ${lines[0] || ''}</div>
                <div class="list-item-subtitle">${lines.slice(1).join(' • ')}</div>
              </div>`;
    }).join('');
  };

  // Preparar educación
  const educacionHtml = formatListToHtml(datosAspirante.educacion, [
    'institucion', 'programa', 'nivel_escolaridad', 'modalidad', 'ano'
  ]);

  // Preparar experiencia
  const experienciaHtml = formatListToHtml(datosAspirante.experiencia_laboral, [
    'empresa', 'cargo', 'tiempo_laborado', 'salario', 'motivo_retiro'
  ]);

  // Preparar familiares
  const familiaresHtml = formatListToHtml(datosAspirante.familiares, [
    'nombre_completo', 'parentesco', 'edad', 'ocupacion'
  ]);

  // Preparar referencias
  const referenciasHtml = formatListToHtml(datosAspirante.referencias, [
    'nombre_completo', 'tipo_referencia', 'telefono', 'ocupacion'
  ]);

  // Formatear contacto de emergencia
  const contactoEmergencia = datosAspirante.contacto_emergencia ?
    `${datosAspirante.contacto_emergencia.nombre_completo || ''} • ${datosAspirante.contacto_emergencia.telefono || ''} • ${datosAspirante.contacto_emergencia.parentesco || ''}` :
    'No registrado';

  // Formatear metas
  const metasHtml = `
    <div class="list-item">
      <div class="list-item-title">1. Corto plazo</div>
      <div class="list-item-subtitle">${datosAspirante.metas_personales?.corto_plazo || 'No especificado'}</div>
    </div>
    <div class="list-item">
      <div class="list-item-title">2. Mediano plazo</div>
      <div class="list-item-subtitle">${datosAspirante.metas_personales?.mediano_plazo || 'No especificado'}</div>
    </div>
    <div class="list-item">
      <div class="list-item-title">3. Largo plazo</div>
      <div class="list-item-subtitle">${datosAspirante.metas_personales?.largo_plazo || 'No especificado'}</div>
    </div>
  `;

  // Datos de seguridad/seguridad
  const seguridad = datosAspirante.seguridad || {};

  // Mapear valores booleanos a "Sí"/"No"
  const mapBoolean = (val) => {
    if (val === undefined || val === null) return "No especificado";
    return val === true || val === 1 || val === "1" || val === "true" ? "Sí" : "No";
  };

  return {
    // Datos básicos
    NOMBRE_COMPLETO: nombreCompleto,
    TIPO_ID: tipo_documento || 'No especificado',
    IDENTIFICACION: identificacion || '',
    FECHA_NACIMIENTO: fecha_nacimiento ? new Date(fecha_nacimiento).toLocaleDateString('es-CO') : '',
    EDAD: edad || '',
    CIUDAD_RESIDENCIA: ciudadResidencia,
    TELEFONO: telefono || '',
    CORREO: correo_electronico || '',
    DIRECCION: direccion_barrio || '',
    ESTADO_CIVIL: estado_civil || '',
    EPS: eps || '',
    AFP: afp || '',
    RH: rh || '',
    TALLA_PANTALON: talla_pantalon || '',
    CAMISA_TALLA: camisa_talla || '',
    ZAPATOS_TALLA: zapatos_talla || '',

    // Foto
    PHOTO_URL: foto_public_url || '',
    LOGO_URL: "https://storage.googleapis.com/logyser-recibo-public/logo.png",

    // Listas formateadas como HTML
    EDUCACION_LIST: educacionHtml,
    EXPERIENCIA_LIST: experienciaHtml,
    FAMILIARES_LIST: familiaresHtml,
    REFERENCIAS_LIST: referenciasHtml,
    CONTACTO_EMERGENCIA: contactoEmergencia,
    METAS: metasHtml,

    // Seguridad/seguridad
    SEG_LLAMADOS: mapBoolean(seguridad.llamados_atencion),
    SEG_DETALLE_LLAMADOS: seguridad.detalle_llamados || '',
    SEG_ACCIDENTE: mapBoolean(seguridad.accidente_laboral),
    SEG_DETALLE_ACCIDENTE: seguridad.detalle_accidente || '',
    SEG_ENFERMEDAD: mapBoolean(seguridad.enfermedad_importante),
    SEG_DETALLE_ENFERMEDAD: seguridad.detalle_enfermedad || '',
    SEG_ALCOHOL: mapBoolean(seguridad.consume_alcohol),
    SEG_FRECUENCIA: seguridad.frecuencia_alcohol || '',
    SEG_FAMILIAR: mapBoolean(seguridad.familiar_en_empresa),
    SEG_DETALLE_FAMILIAR: seguridad.detalle_familiar_empresa || '',
    SEG_INFO_FALSA: mapBoolean(seguridad.info_falsa),
    SEG_POLIGRAFO: mapBoolean(seguridad.acepta_poligrafo),
    SEG_FORTALEZAS: seguridad.fortalezas || '',
    SEG_MEJORAR: seguridad.aspectos_mejorar || '',
    SEG_RESOLUCION: seguridad.resolucion_problemas || '',
    SEG_OBSERVACIONES: seguridad.observaciones || '',

    // Fecha de generación
    FECHA_GENERACION: new Date().toLocaleString('es-CO')
  };
}


app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Servidor Activo - Logyser</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
        
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #000b59 0%, #1c2a80 50%, #000b59 100%);
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            color: white;
        }
        .container {
            text-align: center;
            background: rgba(255, 255, 255, 0.95);
            padding: 50px 40px;
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 90%;
            color: #333;
        }
        .logo {
            width: 180px;
            margin-bottom: 30px;
            filter: brightness(0) invert(0);
        }
        .status-card {
            background: linear-gradient(135deg, #4CAF50, #45a049);
            color: white;
            padding: 30px;
            border-radius: 16px;
            margin: 20px 0;
            box-shadow: 0 10px 30px rgba(76, 175, 80, 0.3);
        }
        .check-icon {
            font-size: 64px;
            margin-bottom: 15px;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
        }
        h1 {
            margin: 0 0 10px 0;
            font-size: 2.2em;
            font-weight: 700;
        }
        .status {
            font-size: 1.3em;
            font-weight: 600;
            margin-bottom: 5px;
        }
        .message {
            font-size: 1.1em;
            opacity: 0.9;
            margin: 0;
        }
        .info {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 12px;
            margin-top: 25px;
            border-left: 4px solid #000b59;
        }
        .info h3 {
            margin: 0 0 10px 0;
            color: #000b59;
            font-size: 1.1em;
        }
        .info p {
            margin: 0;
            color: #666;
            font-size: 0.95em;
        }
    </style>
</head>
<body>
    <div class="container">
        <img src="https://storage.googleapis.com/logyser-recibo-public/logo.png" alt="Logo Logyser" class="logo">
        
        <div class="status-card">
            <div class="check-icon">✅</div>
            <h1>Servidor Activo</h1>
            <div class="status">Estado: Operacional</div>
            <p class="message">El servidor de Logyser funciona correctamente</p>
        </div>
        
        <div class="info">
            <h3>📊 Información del Sistema</h3>
            <p>• Servicio: API Hojas de Vida</p>
            <p>• Estado: ✅ En línea</p>
            <p>• Tiempo: ${new Date().toLocaleString('es-CO')}</p>
        </div>
    </div>
</body>
</html>
  `;

  res.status(200).send(html);
});

// ==========================================
//  ENDPOINT: Tipo de Identificación
// ==========================================

app.get("/api/config/tipo-identificacion", async (req, res) => {
  try {
    const rows = await query(`
      SELECT \`Descripción\` AS descripcion
      FROM Config_Tipo_Identificación
      ORDER BY \`Descripción\`
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error tipo identificación:", error);
    res.status(500).json({ error: "Error cargando tipos de identificación" });
  }
});

// ==========================================
//  ENDPOINT: Departamentos (solo Colombia)
// ==========================================

app.get("/api/config/departamentos", async (req, res) => {
  try {
    const rows = await query(`
      SELECT \`Departamento\` AS departamento
      FROM Config_Departamentos
      WHERE \`País\` = 'Colombia'
      ORDER BY \`Departamento\`
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error departamentos:", error);
    res.status(500).json({ error: "Error cargando departamentos" });
  }
});

// ==========================================
//  ENDPOINT: Ciudades por departamento
// ==========================================

app.get("/api/config/ciudades", async (req, res) => {
  const departamento = req.query.departamento;

  if (!departamento) {
    return res.status(400).json({ error: "Falta el parámetro 'departamento'" });
  }

  try {
    const rows = await query(`
      SELECT \`Ciudad\` AS ciudad
      FROM Config_Ciudades
      WHERE \`Departamento\` = ? AND \`Pais\` = 'Colombia'
      ORDER BY \`Ciudad\`
    `, [departamento]);

    res.json(rows);
  } catch (error) {
    console.error("Error ciudades:", error);
    res.status(500).json({ error: "Error cargando ciudades" });
  }
});

// ==========================================
//  ENDPOINT: EPS
// ==========================================

app.get("/api/config/eps", async (req, res) => {
  try {
    const rows = await query(`
      SELECT \`EPS\` AS eps
      FROM Config_EPS
      ORDER BY \`EPS\`
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error EPS:", error);
    res.status(500).json({ error: "Error cargando EPS" });
  }
});

// ==========================================
//  ENDPOINT: Fondo de Pensión
// ==========================================

app.get("/api/config/pension", async (req, res) => {
  try {
    const rows = await query(`
      SELECT \`Fondo de Pensión\` AS pension
      FROM Config_Pensión
      ORDER BY \`Fondo de Pensión\`
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error pensión:", error);
    res.status(500).json({ error: "Error cargando fondos de pensión" });
  }
});


app.use(express.static(__dirname));
// ==========================================
//  INICIO SERVIDOR
// ==========================================


// ======================================================
//  CONSULTAR ASPIRANTE POR IDENTIFICACIÓN (para evitar duplicados)
//  GET /api/aspirante?identificacion=123
// ======================================================
// Reemplazar la ruta GET /api/aspirante por este handler (devuelve aspirante + relaciones)
app.get("/api/aspirante", async (req, res) => {
  const identificacion = req.query.identificacion;

  if (!identificacion) {
    return res.status(400).json({ error: "Falta la identificación" });
  }

  try {
    // 1) Buscar aspirante
    const rows = await query(
      `SELECT * FROM Dynamic_hv_aspirante WHERE identificacion = ? LIMIT 1`,
      [identificacion]
    );

    if (rows.length === 0) {
      return res.json({ existe: false });
    }

    const aspirante = rows[0];
    const id = aspirante.id_aspirante;

    // 2) Traer relaciones
    const educacion = await query(
      `SELECT institucion, programa, nivel_escolaridad, modalidad, ano, finalizado
       FROM Dynamic_hv_educacion
       WHERE id_aspirante = ? ORDER BY fecha_registro`,
      [id]
    );

    const experiencia = await query(
      `SELECT empresa, cargo, tiempo_laborado, salario, motivo_retiro, funciones FROM Dynamic_hv_experiencia_laboral WHERE id_aspirante = ? ORDER BY fecha_registro`,
      [id]
    );

    const familiares = await query(
      `SELECT nombre_completo, parentesco, edad, ocupacion, conviven_juntos FROM Dynamic_hv_familiares WHERE id_aspirante = ? ORDER BY fecha_registro`,
      [id]
    );

    const referencias = await query(
      `SELECT tipo_referencia, nombre_completo, telefono, ocupacion, empresa, jefe_inmediato, cargo_jefe FROM Dynamic_hv_referencias WHERE id_aspirante = ? ORDER BY fecha_registro`,
      [id]
    );

    const contactoRows = await query(
      `SELECT nombre_completo, parentesco, telefono, correo_electronico, direccion FROM Dynamic_hv_contacto_emergencia WHERE id_aspirante = ? LIMIT 1`,
      [id]
    );
    const contacto_emergencia = contactoRows[0] || null;

    const metasRows = await query(
      `SELECT meta_corto_plazo, meta_mediano_plazo, meta_largo_plazo FROM Dynamic_hv_metas_personales WHERE id_aspirante = ? LIMIT 1`,
      [id]
    );
    const metas_personales = metasRows[0] || null;

    const seguridadRows = await query(
      `SELECT llamados_atencion, detalle_llamados, accidente_laboral, detalle_accidente, enfermedad_importante, detalle_enfermedad, consume_alcohol, frecuencia_alcohol, familiar_en_empresa, detalle_familiar_empresa, info_falsa, acepta_poligrafo, observaciones, califica_para_cargo, fortalezas, aspectos_mejorar, resolucion_problemas FROM Dynamic_hv_seguridad WHERE id_aspirante = ? LIMIT 1`,
      [id]
    );
    const seguridad = seguridadRows[0] || null;

    return res.json({
      existe: true,
      aspirante,
      educacion,
      experiencia_laboral: experiencia,
      familiares,
      referencias,
      contacto_emergencia,
      metas_personales,
      seguridad
    });
  } catch (error) {
    console.error("Error consultando aspirante:", error);
    res.status(500).json({ error: "Error consultando datos del aspirante" });
  }
});
// Endpoint: subir foto de perfil al bucket GCS
// Recibe multipart/form-data con campos: identificacion (string) + photo (file)
app.post("/api/hv/upload-photo", upload.single("photo"), async (req, res) => {
  try {
    const identificacion = req.body.identificacion;
    const file = req.file;

    if (!identificacion) {
      return res.status(400).json({ ok: false, error: "Falta identificacion en el body" });
    }
    if (!file) {
      return res.status(400).json({ ok: false, error: "Falta archivo 'photo' en el form-data" });
    }

    // Normalizar nombre de archivo y construir objeto con prefijo identificacion/
    const safeName = file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-\.]/g, "");
    const destName = `${identificacion}/${Date.now()}_${safeName}`;

    const blob = bucket.file(destName);
    const stream = blob.createWriteStream({
      resumable: false,
      metadata: {
        contentType: file.mimetype
      }
    });

    stream.on("error", (err) => {
      console.error("GCS upload error:", err);
      return res.status(500).json({ ok: false, error: "Error subiendo archivo a storage" });
    });

    stream.on("finish", async () => {
      // --- Dentro de stream.on("finish", async () => { ... }) reemplazar la generación/guardado de URL por:
      try {
        const expiresMs = parseInt(process.env.SIGNED_URL_EXPIRES_MS || String(7 * 24 * 60 * 60 * 1000), 10);
        const expiresAt = Date.now() + expiresMs;

        // Intentar crear signed URL
        let signedUrl = null;
        try {
          const [url] = await blob.getSignedUrl({ action: "read", expires: expiresAt });
          signedUrl = url;
        } catch (errSigned) {
          console.warn("getSignedUrl falló:", errSigned && errSigned.message ? errSigned.message : errSigned);
          signedUrl = null;
        }

        // Fallback: construir una URL pública sin encodeURIComponent en la ruta completa.
        // Usamos la forma https://storage.googleapis.com/<bucket>/<object-name>
        const publicUrlFallback = `https://storage.googleapis.com/${GCS_BUCKET}/${destName}`;

        const urlToStore = signedUrl || publicUrlFallback;

        // Guardar referencia en DB (si no hay signedUrl guardamos la URL pública)
        await pool.query(
          `UPDATE Dynamic_hv_aspirante SET foto_gcs_path = ?, foto_public_url = ? WHERE identificacion = ?`,
          [destName, signedUrl || publicUrlFallback, identificacion]
        );

        return res.json({
          ok: true,
          foto_gcs_path: destName,
          foto_public_url: urlToStore,
          message: signedUrl ? "Signed URL generada" : "Archivo subido; fallback a URL pública"
        });
      } catch (err) {
        console.error("Error post-upload:", err);
        return res.status(500).json({ ok: false, error: "Error guardando referencia en DB" });
      }
    });

    // Iniciar escritura
    stream.end(file.buffer);
  } catch (err) {
    console.error("Error upload-photo:", err);
    return res.status(500).json({ ok: false, error: "Error en endpoint upload-photo" });
  }
});

// ======================================================
//  REGISTRO COMPLETO DE HOJA DE VIDA
//  POST /api/hv/registrar
// ======================================================
app.post("/api/hv/registrar", async (req, res) => {
  const body = req.body;

  // Desestructuramos lo que envía el front
  const datosAspirante = body || {};

  const {
    // Datos personales (Dynamic_hv_aspirante)
    tipo_documento,
    identificacion,
    primer_nombre,
    segundo_nombre,
    primer_apellido,
    segundo_apellido,
    fecha_nacimiento,
    edad,
    departamento_expedicion,
    ciudad_expedicion,
    fecha_expedicion,
    estado_civil,
    direccion_barrio,
    departamento_residencia,
    ciudad_residencia,
    telefono,
    correo_electronico,
    eps,
    afp,
    rh,
    talla_pantalon,
    camisa_talla,
    zapatos_talla,
    origen_registro,
    medio_reclutamiento,
    recomendador_aspirante,
    foto_public_url,
    foto_gcs_path,

    // Bloques relacionados
    educacion = [],
    experiencia_laboral = [],
    familiares = [],
    referencias = [],
    contacto_emergencia = {},
    metas_personales = {},
    seguridad = {}
  } = datosAspirante;

  const conn = await pool.getConnection();
  let pdfUrl = null;
  let pdfGcsPath = null;
  let idAspirante = null;

  try {
    await conn.beginTransaction();

    console.log("🔍 Iniciando registro de HV para:", identificacion);
    console.log("📊 Datos recibidos:", {
      educacionCount: educacion.length,
      experienciaCount: experiencia_laboral.length,
      familiaresCount: familiares.length,
      referenciasCount: referencias.length
    });

    // 1. GENERAR PDF REAL CON TU SISTEMA
    console.log("🎯 Generando PDF real con template...");
    let pdfGenerated = false;

    try {
      // Asegurar que los datos sean arrays (no strings vacíos)
      const safeEducacion = Array.isArray(educacion) ? educacion : [];
      const safeExperiencia = Array.isArray(experiencia_laboral) ? experiencia_laboral : [];
      const safeFamiliares = Array.isArray(familiares) ? familiares : [];
      const safeReferencias = Array.isArray(referencias) ? referencias : [];

      // Preparar datos para el template PDF
      const nombreCompleto = [
        primer_nombre,
        segundo_nombre,
        primer_apellido,
        segundo_apellido
      ].filter(Boolean).join(' ');

      const ciudadResidencia = ciudad_residencia ?
        `${ciudad_residencia}${departamento_residencia ? `, ${departamento_residencia}` : ''}` :
        (departamento_residencia || '');

      // Transformar arrays a HTML formateado
      const formatListToHtml = (items, fields, titleField = null) => {
        if (!items || !Array.isArray(items) || items.length === 0) {
          return '<div class="list-item">No registrado</div>';
        }

        return items.map((item, index) => {
          const lines = fields.map(field => {
            if (item[field]) {
              return `${item[field]}`;
            }
            return null;
          }).filter(Boolean);

          const title = titleField ? item[titleField] || lines[0] || `Registro ${index + 1}` : lines[0] || `Registro ${index + 1}`;
          const subtitle = lines.slice(1).join(' • ') || '';

          return `<div class="list-item">
                    <div class="list-item-title">${index + 1}. ${title}</div>
                    ${subtitle ? `<div class="list-item-subtitle">${subtitle}</div>` : ''}
                  </div>`;
        }).join('');
      };

      // Preparar educación
      const educacionHtml = formatListToHtml(safeEducacion,
        ['institucion', 'programa', 'nivel_escolaridad', 'modalidad', 'ano'],
        'institucion'
      );

      // Preparar experiencia
      const experienciaHtml = formatListToHtml(safeExperiencia,
        ['empresa', 'cargo', 'tiempo_laborado', 'salario', 'motivo_retiro'],
        'empresa'
      );

      // Preparar familiares
      const familiaresHtml = formatListToHtml(safeFamiliares,
        ['nombre_completo', 'parentesco', 'edad', 'ocupacion'],
        'nombre_completo'
      );

      // Preparar referencias
      const referenciasHtml = formatListToHtml(safeReferencias,
        ['nombre_completo', 'tipo_referencia', 'telefono', 'ocupacion'],
        'nombre_completo'
      );

      // Formatear contacto de emergencia
      const contactoEmergenciaStr = contacto_emergencia?.nombre_completo ?
        `${contacto_emergencia.nombre_completo} • ${contacto_emergencia.telefono || ''} • ${contacto_emergencia.parentesco || ''}` :
        'No registrado';

      // Formatear metas
      const metasHtml = `
        <div class="list-item">
          <div class="list-item-title">1. Corto plazo</div>
          <div class="list-item-subtitle">${metas_personales?.corto_plazo || 'No especificado'}</div>
        </div>
        <div class="list-item">
          <div class="list-item-title">2. Mediano plazo</div>
          <div class="list-item-subtitle">${metas_personales?.mediano_plazo || 'No especificado'}</div>
        </div>
        <div class="list-item">
          <div class="list-item-title">3. Largo plazo</div>
          <div class="list-item-subtitle">${metas_personales?.largo_plazo || 'No especificado'}</div>
        </div>
      `;

      // Mapear valores booleanos a "Sí"/"No"
      const mapBoolean = (val) => {
        if (val === undefined || val === null) return "No";
        return val === true || val === 1 || val === "1" || val === "true" ? "Sí" : "No";
      };

      // Preparar dataObjects para el template
      const dataObjects = {
        // Datos básicos
        NOMBRE_COMPLETO: nombreCompleto,
        TIPO_ID: tipo_documento || 'No especificado',
        IDENTIFICACION: identificacion || '',
        FECHA_NACIMIENTO: fecha_nacimiento ? new Date(fecha_nacimiento).toLocaleDateString('es-CO') : '',
        EDAD: edad || '',
        CIUDAD_RESIDENCIA: ciudadResidencia,
        TELEFONO: telefono || '',
        CORREO: correo_electronico || '',
        DIRECCION: direccion_barrio || '',
        ESTADO_CIVIL: estado_civil || '',
        EPS: eps || '',
        AFP: afp || '',
        RH: rh || '',
        TALLA_PANTALON: talla_pantalon || '',
        CAMISA_TALLA: camisa_talla || '',
        ZAPATOS_TALLA: zapatos_talla || '',

        // Foto
        PHOTO_URL: foto_public_url || '',
        LOGO_URL: "https://storage.googleapis.com/logyser-recibo-public/logo.png",

        // Listas formateadas como HTML
        EDUCACION_LIST: educacionHtml,
        EXPERIENCIA_LIST: experienciaHtml,
        FAMILIARES_LIST: familiaresHtml,
        REFERENCIAS_LIST: referenciasHtml,
        CONTACTO_EMERGENCIA: contactoEmergenciaStr,
        METAS: metasHtml,

        // Seguridad
        SEG_LLAMADOS: mapBoolean(seguridad?.llamados_atencion),
        SEG_DETALLE_LLAMADOS: seguridad?.detalle_llamados || '',
        SEG_ACCIDENTE: mapBoolean(seguridad?.accidente_laboral),
        SEG_DETALLE_ACCIDENTE: seguridad?.detalle_accidente || '',
        SEG_ENFERMEDAD: mapBoolean(seguridad?.enfermedad_importante),
        SEG_DETALLE_ENFERMEDAD: seguridad?.detalle_enfermedad || '',
        SEG_ALCOHOL: mapBoolean(seguridad?.consume_alcohol),
        SEG_FRECUENCIA: seguridad?.frecuencia_alcohol || '',
        SEG_FAMILIAR: mapBoolean(seguridad?.familiar_en_empresa),
        SEG_DETALLE_FAMILIAR: seguridad?.detalle_familiar_empresa || '',
        SEG_INFO_FALSA: mapBoolean(seguridad?.info_falsa),
        SEG_POLIGRAFO: mapBoolean(seguridad?.acepta_poligrafo),
        SEG_FORTALEZAS: seguridad?.fortalezas || '',
        SEG_MEJORAR: seguridad?.aspectos_mejorar || '',
        SEG_RESOLUCION: seguridad?.resolucion_problemas || '',
        SEG_OBSERVACIONES: seguridad?.observaciones || '',

        // Fecha de generación
        FECHA_GENERACION: new Date().toLocaleString('es-CO')
      };

      console.log("📊 DataObjects preparados con", Object.keys(dataObjects).length, "campos");

      // Llamar a tu función real de generación de PDF
      const pdfResult = await generateAndUploadPdf({
        identificacion: identificacion,
        dataObjects: dataObjects
      });

      if (pdfResult.success) {
        console.log(`✅ PDF generado exitosamente: ${pdfResult.url}`);
        pdfUrl = pdfResult.url;
        pdfGcsPath = pdfResult.fileName;
        pdfGenerated = true;
      } else {
        console.error(`❌ Error generando PDF: ${pdfResult.error}`);
        throw new Error(`Fallo en generación de PDF: ${pdfResult.error}`);
      }

    } catch (pdfError) {
      console.error("❌ ERROR generando PDF real:", pdfError.message);
      console.error("📌 Stack:", pdfError.stack);
      pdfUrl = null;
      pdfGcsPath = null;
      pdfGenerated = false;
      // Continuar sin PDF pero registrar el error
    }

    // 2. VERIFICAR SI YA EXISTE ASPIRANTE
    if (identificacion) {
      const [existingRows] = await conn.query(
        `SELECT id_aspirante FROM Dynamic_hv_aspirante WHERE identificacion = ? LIMIT 1`,
        [identificacion]
      );
      if (existingRows && existingRows.length > 0) {
        idAspirante = existingRows[0].id_aspirante;
        console.log(`🔍 Aspirante existente encontrado: ID ${idAspirante}`);
      }
    }

    // 3. INSERTAR O ACTUALIZAR ASPIRANTE CON LA URL DEL PDF
    if (idAspirante) {
      // --- Caso: ya existe -> UPDATE ---
      console.log("🔄 Actualizando aspirante existente:", idAspirante);
      await conn.query(
        `
        UPDATE Dynamic_hv_aspirante SET
          tipo_documento = ?,
          primer_nombre = ?,
          segundo_nombre = ?,
          primer_apellido = ?,
          segundo_apellido = ?,
          fecha_nacimiento = ?,
          edad = ?,
          departamento_expedicion = ?,
          ciudad_expedicion = ?,
          fecha_expedicion = ?,
          estado_civil = ?,
          direccion_barrio = ?,
          departamento = ?,
          ciudad = ?,
          telefono = ?,
          correo_electronico = ?,
          eps = ?,
          afp = ?,
          rh = ?,
          talla_pantalon = ?,
          camisa_talla = ?,
          zapatos_talla = ?,
          foto_gcs_path = ?,
          foto_public_url = ?,
          pdf_gcs_path = ?,
          pdf_public_url = ?,
          origen_registro = ?,
          medio_reclutamiento = ?,
          recomendador_aspirante = ?,
          fecha_registro = NOW()
        WHERE id_aspirante = ?
        `,
        [
          tipo_documento || null,
          primer_nombre || null,
          segundo_nombre || null,
          primer_apellido || null,
          segundo_apellido || null,
          fecha_nacimiento || null,
          edad || null,
          departamento_expedicion || null,
          ciudad_expedicion || null,
          fecha_expedicion || null,
          estado_civil || null,
          direccion_barrio || null,
          departamento_residencia || null,
          ciudad_residencia || null,
          telefono || null,
          correo_electronico || null,
          eps || null,
          afp || null,
          rh || null,
          talla_pantalon || null,
          camisa_talla || null,
          zapatos_talla || null,
          foto_gcs_path || null,
          foto_public_url || null,
          pdfGcsPath,
          pdfUrl,
          origen_registro || "WEB",
          medio_reclutamiento || null,
          recomendador_aspirante || null,
          idAspirante
        ]
      );

      // Borrar datos hijos existentes
      console.log("🗑️ Borrando registros anteriores...");
      await conn.query(`DELETE FROM Dynamic_hv_educacion WHERE id_aspirante = ?`, [idAspirante]);
      await conn.query(`DELETE FROM Dynamic_hv_experiencia_laboral WHERE id_aspirante = ?`, [idAspirante]);
      await conn.query(`DELETE FROM Dynamic_hv_familiares WHERE id_aspirante = ?`, [idAspirante]);
      await conn.query(`DELETE FROM Dynamic_hv_referencias WHERE id_aspirante = ?`, [idAspirante]);
      await conn.query(`DELETE FROM Dynamic_hv_contacto_emergencia WHERE id_aspirante = ?`, [idAspirante]);
      await conn.query(`DELETE FROM Dynamic_hv_metas_personales WHERE id_aspirante = ?`, [idAspirante]);
      await conn.query(`DELETE FROM Dynamic_hv_seguridad WHERE id_aspirante = ?`, [idAspirante]);

    } else {
      // --- Caso: no existe -> INSERT nuevo aspirante ---
      console.log("🆕 Insertando nuevo aspirante");
      const [aspiranteResult] = await conn.query(
        `
        INSERT INTO Dynamic_hv_aspirante (
          tipo_documento,
          identificacion,
          primer_nombre,
          segundo_nombre,
          primer_apellido,
          segundo_apellido,
          fecha_nacimiento,
          edad,
          departamento_expedicion,
          ciudad_expedicion,
          fecha_expedicion,
          estado_civil,
          direccion_barrio,
          departamento,
          ciudad,
          telefono,
          correo_electronico,
          eps,
          afp,
          rh,
          talla_pantalon,
          camisa_talla,
          zapatos_talla,
          foto_gcs_path,
          foto_public_url,
          pdf_gcs_path,
          pdf_public_url,
          origen_registro,
          medio_reclutamiento,
          recomendador_aspirante,
          fecha_registro
        )
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, NOW())
        `,
        [
          tipo_documento || null,
          identificacion || null,
          primer_nombre || null,
          segundo_nombre || null,
          primer_apellido || null,
          segundo_apellido || null,
          fecha_nacimiento || null,
          edad || null,
          departamento_expedicion || null,
          ciudad_expedicion || null,
          fecha_expedicion || null,
          estado_civil || null,
          direccion_barrio || null,
          departamento_residencia || null,
          ciudad_residencia || null,
          telefono || null,
          correo_electronico || null,
          eps || null,
          afp || null,
          rh || null,
          talla_pantalon || null,
          camisa_talla || null,
          zapatos_talla || null,
          foto_gcs_path || null,
          foto_public_url || null,
          pdfGcsPath,
          pdfUrl,
          origen_registro || "WEB",
          medio_reclutamiento || null,
          recomendador_aspirante || null
        ]
      );

      const [rowId] = await conn.query(
        `SELECT id_aspirante FROM Dynamic_hv_aspirante WHERE identificacion = ? ORDER BY fecha_registro DESC LIMIT 1`,
        [identificacion]
      );
      idAspirante = rowId && rowId[0] ? rowId[0].id_aspirante : aspiranteResult.insertId;
      console.log(`✅ Nuevo aspirante creado con ID: ${idAspirante}`);
    }

    if (!idAspirante) {
      throw new Error("No se pudo obtener id_aspirante después de insert/update");
    }

    // 4. INSERTAR DATOS HIJOS
    console.log("📝 Insertando datos relacionados...");

    // Educación
    let educCount = 0;
    for (const edu of educacion) {
      if (!edu.institucion && !edu.programa) continue;
      await conn.query(
        `INSERT INTO Dynamic_hv_educacion (id_aspirante, institucion, programa, nivel_escolaridad, modalidad, ano, finalizado)
         VALUES (?,?,?,?,?,?,?)`,
        [idAspirante, edu.institucion || null, edu.programa || null, edu.nivel_escolaridad || null,
          edu.modalidad || null, edu.ano || null, edu.finalizado || null]
      );
      educCount++;
    }
    console.log(`✅ ${educCount} registros de educación insertados`);

    // Experiencia laboral
    let expCount = 0;
    for (const exp of experiencia_laboral) {
      if (!exp.empresa && !exp.cargo) continue;
      await conn.query(
        `INSERT INTO Dynamic_hv_experiencia_laboral (id_aspirante, empresa, cargo, tiempo_laborado, salario, motivo_retiro, funciones)
         VALUES (?,?,?,?,?,?,?)`,
        [idAspirante, exp.empresa || null, exp.cargo || null, exp.tiempo_laborado || null,
          exp.salario || null, exp.motivo_retiro || null, exp.funciones || null]
      );
      expCount++;
    }
    console.log(`✅ ${expCount} registros de experiencia insertados`);

    // Familiares
    let famCount = 0;
    for (const fam of familiares) {
      if (!fam.nombre_completo) continue;
      await conn.query(
        `INSERT INTO Dynamic_hv_familiares (id_aspirante, nombre_completo, parentesco, edad, ocupacion, conviven_juntos)
         VALUES (?,?,?,?,?,?)`,
        [idAspirante, fam.nombre_completo || null, fam.parentesco || null, fam.edad || null,
          fam.ocupacion || null, fam.conviven_juntos || null]
      );
      famCount++;
    }
    console.log(`✅ ${famCount} registros de familiares insertados`);

    // Referencias
    let refCount = 0;
    for (const ref of referencias) {
      if (!ref.tipo_referencia) continue;
      await conn.query(
        `INSERT INTO Dynamic_hv_referencias (id_aspirante, tipo_referencia, empresa, jefe_inmediato, cargo_jefe, nombre_completo, telefono, ocupacion)
         VALUES (?,?,?,?,?,?,?,?)`,
        [idAspirante, ref.tipo_referencia || null, ref.empresa || null, ref.jefe_inmediato || null,
          ref.cargo_jefe || null, ref.nombre_completo || null, ref.telefono || null, ref.ocupacion || null]
      );
      refCount++;
    }
    console.log(`✅ ${refCount} registros de referencias insertados`);

    // Contacto de emergencia
    if (contacto_emergencia && contacto_emergencia.nombre_completo) {
      await conn.query(
        `INSERT INTO Dynamic_hv_contacto_emergencia (id_aspirante, nombre_completo, parentesco, telefono, correo_electronico, direccion)
         VALUES (?,?,?,?,?,?)`,
        [idAspirante, contacto_emergencia.nombre_completo, contacto_emergencia.parentesco,
          contacto_emergencia.telefono, contacto_emergencia.correo_electronico, contacto_emergencia.direccion]
      );
      console.log(`✅ Contacto de emergencia insertado`);
    }

    // Metas personales
    if (metas_personales && (metas_personales.corto_plazo || metas_personales.mediano_plazo || metas_personales.largo_plazo)) {
      await conn.query(
        `INSERT INTO Dynamic_hv_metas_personales (id_aspirante, meta_corto_plazo, meta_mediano_plazo, meta_largo_plazo)
         VALUES (?,?,?,?)`,
        [idAspirante, metas_personales.corto_plazo || null, metas_personales.mediano_plazo || null,
          metas_personales.largo_plazo || null]
      );
      console.log(`✅ Metas personales insertadas`);
    }

    // Seguridad
    if (seguridad) {
      await conn.query(
        `INSERT INTO Dynamic_hv_seguridad (
          id_aspirante, llamados_atencion, detalle_llamados, accidente_laboral, detalle_accidente,
          enfermedad_importante, detalle_enfermedad, consume_alcohol, frecuencia_alcohol,
          familiar_en_empresa, detalle_familiar_empresa, info_falsa, acepta_poligrafo,
          observaciones, califica_para_cargo, fortalezas, aspectos_mejorar, resolucion_problemas
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          idAspirante,
          seguridad.llamados_atencion || null,
          seguridad.detalle_llamados || null,
          seguridad.accidente_laboral || null,
          seguridad.detalle_accidente || null,
          seguridad.enfermedad_importante || null,
          seguridad.detalle_enfermedad || null,
          seguridad.consume_alcohol || null,
          seguridad.frecuencia_alcohol || null,
          seguridad.familiar_en_empresa || null,
          seguridad.detalle_familiar_empresa || null,
          seguridad.info_falsa || null,
          seguridad.acepta_poligrafo || null,
          seguridad.observaciones || null,
          seguridad.califica_para_cargo || null,
          seguridad.fortalezas || null,
          seguridad.aspectos_mejorar || null,
          seguridad.resolucion_problemas || null
        ]
      );
      console.log(`✅ Datos de seguridad insertados`);
    }

    // 5. CONFIRMAR TRANSACCIÓN
    await conn.commit();
    console.log("✅ Transacción completada exitosamente");

    // 6. RESPONDER AL FRONTEND
    const response = {
      ok: true,
      success: true,
      message: "Hoja de vida registrada correctamente",
      id_aspirante: idAspirante,
      pdf_url: pdfUrl,
      pdf_generated: pdfGenerated
    };

    if (!pdfGenerated) {
      response.warning = "El PDF no se pudo generar, pero los datos fueron guardados correctamente";
      console.warn("⚠️ PDF no generado, pero datos guardados en DB");
    } else {
      console.log("✅ Todo completado - PDF disponible en:", pdfUrl);
      console.log("📊 Resumen:", {
        aspirante_id: idAspirante,
        pdf_url: pdfUrl,
        registros: { educacion: educCount, experiencia: expCount, familiares: famCount, referencias: refCount }
      });
    }

    console.log("📤 Enviando respuesta al frontend");
    res.json(response);

  } catch (error) {
    console.error("❌ ERROR registrando HV:");
    console.error("❌ Mensaje:", error.message);
    console.error("❌ Stack:", error.stack);

    // Rollback solo si la conexión está activa
    try {
      if (conn) {
        await conn.rollback();
        console.log("↩️ Rollback ejecutado");
      }
    } catch (rollbackError) {
      console.error("Error en rollback:", rollbackError);
    }

    res.status(500).json({
      ok: false,
      success: false,
      error: "Error registrando hoja de vida: " + error.message,
      pdf_url: null,
      pdf_generated: false
    });

  } finally {
    // Liberar conexión solo si está activa
    try {
      if (conn) {
        conn.release();
        console.log("🔚 Conexión liberada");
      }
    } catch (releaseError) {
      console.error("Error liberando conexión:", releaseError);
    }
  }
});

app.use("/api/correo", correoAspiranteRoutes);


// --- Inicio del servidor ---
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`HV server listening on port ${PORT}`);
});

// Graceful shutdown: cerrar pool de conexiones antes de salir
async function shutdown() {
  console.log("Shutting down server...");
  try {
    await pool.end();
    console.log("DB pool closed.");
  } catch (err) {
    console.error("Error closing DB pool:", err);
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);