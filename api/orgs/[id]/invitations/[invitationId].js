import { prisma } from '../../../_lib/prisma.js';
import { requireMember } from '../../../_lib/authz.js';
import { revokePendingInvitation } from '../../../_lib/organizations.js';

export default async function handler(req, res, client = prisma) {
  const ctx = await requireMember(req, res, { client, role: 'owner' });
  if (!ctx) return;

  if (req.query?.id !== ctx.orgId) {
    res.status(404).json({ error: 'Organización no encontrada.' });
    return;
  }
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    await revokePendingInvitation(client, {
      organizationId: ctx.orgId,
      invitationId: req.query?.invitationId,
    });
    res.status(204).json(null);
  } catch (err) {
    if (err?.code === 'INVITATION_NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('Error revocando invitación:', err);
    res.status(500).json({ error: 'No se ha podido revocar la invitación.' });
  }
}
