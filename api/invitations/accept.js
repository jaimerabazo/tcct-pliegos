import { prisma } from '../_lib/prisma.js';
import { requireUser } from '../_lib/auth.js';
import { invitationAcceptSchema } from '../_lib/schemas.js';
import { acceptInvitation } from '../_lib/organizations.js';

// Excepción deliberada al guard multi-tenant: el usuario aún no pertenece a la org.
// La función SQL SECURITY DEFINER es la única pieza que puede leer esa invitación y
// convertirla atómicamente en una membership.
export default async function handler(req, res, client = prisma) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const parsed = invitationAcceptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'El token de invitación no es válido.' });
    return;
  }

  try {
    const membership = await acceptInvitation(client, {
      token: parsed.data.token,
      userId: user.id,
      email: user.email,
    });
    res.status(200).json(membership);
  } catch (err) {
    const known = {
      EMAIL_REQUIRED: [400, err.message],
      INVITATION_INVALID: [400, err.message],
      P0001: [400, err.message],
    }[err?.code];
    if (known) {
      res.status(known[0]).json({ error: known[1] });
      return;
    }
    console.error('Error aceptando invitación:', err);
    res.status(500).json({ error: 'No se ha podido aceptar la invitación.' });
  }
}
