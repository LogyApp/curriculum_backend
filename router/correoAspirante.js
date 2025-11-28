import express from "express";
import enviarCorreoAspirante from "../send-to-email.js";


const router = express.Router();

router.post("/aspirante", async (req, res) => {
    try {
        const {
            nombre,
            identificacion,
            correo,
            telefono,
            pdf_url,
            timestamp
        } = req.body;

        if (!nombre || !identificacion || !correo || !telefono || !pdf_url || !timestamp) {
            return res.status(400).json({
                ok: false,
                error: "Faltan datos requeridos"
            });
        }

        await enviarCorreoAspirante({
            nombre,
            identificacion,
            correo,
            telefono,
            pdf_url,
            timestamp
        });

        return res.json({
            ok: true,
            message: "Correo enviado correctamente"
        });

    } catch (error) {
        console.error("Error enviando correo:", error);

        return res.status(500).json({
            ok: false,
            error: "Error enviando el correo"
        });
    }
});

export default router;
