import nodemailer from "nodemailer";

async function enviarCorreoAspirante({
  nombre,
  identificacion,
  correo,
  telefono,
  pdf_url,
  timestamp
}) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'logyser.noreply@gmail.com',
      pass: 'dxsw ibpr qsox muvk'
    }
  });

  const asunto = `Nuevo aspirante registrado — ${nombre} (${identificacion})`;

  const textoPlano = `
Se ha registrado un nuevo aspirante en Logyser.

Nombre: ${nombre}
Identificación: ${identificacion}
Correo: ${correo}
Teléfono: ${telefono}
Hoja de vida (PDF): ${pdf_url}
Fecha registro: ${timestamp}

Revisa en LogyApp para más detalles.
  `;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; padding: 15px;">
      <h2 style="color: #f57c00;">Nuevo aspirante registrado</h2>

      <p><strong>Nombre:</strong> ${nombre}</p>
      <p><strong>Identificación:</strong> ${identificacion}</p>
      <p><strong>Correo:</strong> ${correo}</p>
      <p><strong>Teléfono:</strong> ${telefono}</p>

      <p><strong>Fecha registro:</strong> ${timestamp}</p>

      <br>

      <a href="${pdf_url}"
        style="
          display: inline-block;
          background-color: #f57c00;
          color: white;
          padding: 10px 18px;
          font-size: 15px;
          text-decoration: none;
          border-radius: 6px;
        ">
        📄 Ver Hoja de Vida (PDF)
      </a>

      <br><br>

      <p>Revisa en LogyApp para más detalles.</p>
    </div>
  `;

  const info = await transporter.sendMail({
    from: '"Logyser Notificaciones" <logyser.noreply@gmail.com>',
    to: "seguimientologyser@gmail.com",
    subject: asunto,
    text: textoPlano,
    html: html
  });

  console.log("Correo enviado:", info.messageId);
}

export default enviarCorreoAspirante;

