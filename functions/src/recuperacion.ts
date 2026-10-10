import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { createTransport } from 'nodemailer';

// Contraseña de aplicación de la cuenta de Gmail que envía el correo
// (firebase functions:secrets:set GMAIL_APP_PASSWORD). El remitente por
// defecto es la cuenta del proyecto; se puede cambiar con el parámetro.
const gmailPassword = defineSecret('GMAIL_APP_PASSWORD');
const gmailUser = defineString('GMAIL_USER', { default: 'alertbxt@gmail.com' });

const APP_URL = 'https://alertbxt.web.app';
const ESPERA_ENTRE_SOLICITUDES_MS = 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function construirCorreoRecuperacion(email: string, enlace: string): { asunto: string; texto: string; html: string } {
  const asunto = 'Restablece tu contraseña de AlertBxt';
  const texto = [
    'Hola,',
    '',
    `Recibimos una solicitud para restablecer la contraseña de AlertBxt de la cuenta ${email}.`,
    'Abre este enlace para elegir una contraseña nueva (vence en 1 hora y solo sirve una vez):',
    enlace,
    '',
    'Si no la solicitaste, ignora este correo: tu contraseña actual sigue funcionando.',
    '',
    'El equipo de AlertBxt',
  ].join('\n');

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Restablece tu contraseña de AlertBxt</title>
</head>
<body style="margin:0;padding:0;background:#f2f4f8;font-family:Arial,Helvetica,sans-serif;color:#1d2733;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e1e6ee;">
        <tr><td align="center" style="background:#17263a;padding:28px 20px;">
          <img src="${APP_URL}/assets/icon/Alertlogo.png" width="84" height="84" alt="AlertBxt" style="display:block;border-radius:20px;" />
          <div style="margin-top:12px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">AlertBxt</div>
        </td></tr>
        <tr><td style="padding:30px 28px 8px;">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#17263a;">Restablece tu contraseña</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Recibimos una solicitud para cambiar la contraseña de la cuenta <strong>${escapar(email)}</strong>.</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Toca el botón para elegir una contraseña nueva. El enlace vence en 1 hora y solo se puede usar una vez.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 28px 26px;">
          <a href="${enlace}" style="display:inline-block;background:#2f5d8a;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;">Elegir contraseña nueva</a>
        </td></tr>
        <tr><td style="padding:0 28px 28px;">
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#5b6675;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
          <p style="margin:0 0 18px;font-size:12px;line-height:1.5;color:#2f5d8a;word-break:break-all;">${escapar(enlace)}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5b6675;">Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.</p>
        </td></tr>
        <tr><td align="center" style="background:#f7f9fc;padding:16px 20px;font-size:12px;color:#7a8594;">AlertBxt · Comunicación para tu conjunto residencial</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { asunto, texto, html };
}

// Envía el correo de recuperación con diseño propio desde la cuenta de Gmail del
// proyecto (mejor reputación que el remitente por defecto de Firebase, que
// suele caer en spam). Por privacidad responde siempre igual, exista o no la
// cuenta, y limita a una solicitud por minuto y correo.
export const solicitarRecuperacionContrasena = onCall<{ email?: string }>(
  { secrets: [gmailPassword] },
  async request => {
    const email = (request.data?.email ?? '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(email) || email.length > 120) {
      throw new HttpsError('invalid-argument', 'Ingresa un correo válido.');
    }

    const db = getFirestore();
    const registro = db.doc(`recuperaciones/${createHash('sha256').update(email).digest('hex')}`);
    const previo = await registro.get();
    const ultima = previo.get('ultimaSolicitud') as number | undefined;
    if (ultima && Date.now() - ultima < ESPERA_ENTRE_SOLICITUDES_MS) {
      return { ok: true };
    }
    await registro.set({ ultimaSolicitud: Date.now() });

    let enlaceFirebase: string;
    try {
      enlaceFirebase = await getAuth().generatePasswordResetLink(email);
    } catch (error) {
      if ((error as { code?: string }).code === 'auth/user-not-found') {
        return { ok: true };
      }
      logger.error('No se pudo generar el enlace de recuperación', error);
      throw new HttpsError('internal', 'No se pudo generar el enlace.');
    }

    // El enlace de Firebase apunta a su página genérica; solo se usa el código
    // para abrir la página de la propia app.
    const oobCode = new URL(enlaceFirebase).searchParams.get('oobCode');
    if (!oobCode) {
      throw new HttpsError('internal', 'No se pudo generar el enlace.');
    }
    const enlace = `${APP_URL}/restablecer-contrasena?oobCode=${encodeURIComponent(oobCode)}`;
    const { asunto, texto, html } = construirCorreoRecuperacion(email, enlace);

    try {
      const transporte = createTransport({
        service: 'gmail',
        auth: { user: gmailUser.value(), pass: gmailPassword.value() },
      });
      await transporte.sendMail({
        from: `"AlertBxt" <${gmailUser.value()}>`,
        to: email,
        subject: asunto,
        text: texto,
        html,
      });
    } catch (error) {
      logger.error('No se pudo enviar el correo de recuperación', error);
      throw new HttpsError('internal', 'No se pudo enviar el correo.');
    }

    return { ok: true };
  }
);
