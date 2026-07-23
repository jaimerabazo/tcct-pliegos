import { prisma } from '../../_lib/prisma.js';
import { requireMember } from '../../_lib/authz.js';
import { invitationCreateSchema } from '../../_lib/schemas.js';
import { createInvitation } from '../../_lib/organizations.js';

export default async function handler(req, res, client = prisma) {
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

  try {
    const { invitation, token } = await createInvitation(client, {
      organizationId: ctx.orgId,
      email: parsed.data.email,
      role: parsed.data.role,
      createdBy: ctx.user.id,
    });
    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
      token,
    });
  } catch (err) {
    if (err?.code === 'INVITATION_EXISTS') {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error('Error creando invitación:', err);
    res.status(500).json({ error: 'No se ha podido crear la invitación.' });
  }
}
