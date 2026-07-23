import { prisma } from '../../_lib/prisma.js';
import { requireMember } from '../../_lib/authz.js';
import { invitationCreateSchema } from '../../_lib/schemas.js';
import { createInvitation, rollbackInvitation } from '../../_lib/organizations.js';
import { inviteUserByEmail } from '../../_lib/supabaseAdmin.js';

function invitationRedirectUrl(token, env = process.env) {
  const configuredUrl = env.APP_URL
    || env.PUBLIC_APP_URL
    || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null);

  try {
    const url = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    url.searchParams.set('invitation', token);
    return url.toString();
  } catch {
    const error = new Error('Falta configurar APP_URL para generar el enlace de invitación.');
    error.code = 'APP_URL_NOT_CONFIGURED';
    throw error;
  }
}

export default async function handler(
  req,
  res,
  client = prisma,
  { inviteUser = inviteUserByEmail, env = process.env } = {},
) {
  const ctx = await requireMember(req, res, { client, role: 'owner' });
  if (!ctx) return;

  if (req.query?.id !== ctx.orgId) {
    res.status(404).json({ error: 'Organización no encontrada.' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const parsed = invitationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Los datos de la invitación no son válidos.', details: parsed.error.issues });
    return;
  }

  let created;
  try {
    created = await createInvitation(client, {
      organizationId: ctx.orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      createdBy: ctx.user.id,
    });
    const { invitation } = created;

    await inviteUser(
      invitation.email,
      invitationRedirectUrl(created.token, env),
    );

    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (err) {
    // Si Auth no provisiona ni envía el correo (invite para nuevos, magic link para
    // existentes), deshacemos la creación o restauramos la versión anterior. Es una
    // compensación porque la llamada HTTP externa no puede formar parte de la
    // transacción de Postgres.
    if (created && ['AUTH_INVITE_FAILED', 'AUTH_INVITE_NOT_CONFIGURED', 'APP_URL_NOT_CONFIGURED'].includes(err?.code)) {
      try {
        await rollbackInvitation(client, created);
      } catch (cleanupError) {
        console.error('Error revirtiendo invitación sin correo:', cleanupError);
      }
    }
    if (err?.code === 'AUTH_INVITE_NOT_CONFIGURED' || err?.code === 'APP_URL_NOT_CONFIGURED') {
      console.error('Configuración de invitaciones incompleta:', err);
      res.status(503).json({ error: 'El envío de invitaciones no está configurado.' });
      return;
    }
    if (err?.code === 'AUTH_INVITE_FAILED') {
      console.error('Error invitando usuario en Supabase Auth:', err.cause || err);
      res.status(502).json({ error: 'No se ha podido enviar la invitación por email.' });
      return;
    }
    console.error('Error creando invitación:', err);
    res.status(500).json({ error: 'No se ha podido crear la invitación.' });
  }
}
