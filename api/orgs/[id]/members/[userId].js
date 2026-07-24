import { prisma } from '../../../_lib/prisma.js';
import { requireMember } from '../../../_lib/authz.js';
import { removeMember } from '../../../_lib/organizations.js';

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
    await removeMember(client, {
      organizationId: ctx.orgId,
      actorUserId: ctx.user.id,
      targetUserId: req.query?.userId,
    });
    res.status(204).json(null);
  } catch (err) {
    if (err?.code === 'MEMBER_NOT_FOUND') {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err?.code === 'LAST_OWNER') {
      res.status(409).json({ error: err.message });
      return;
    }
    console.error('Error quitando miembro:', err);
    res.status(500).json({ error: 'No se ha podido quitar el miembro.' });
  }
}
