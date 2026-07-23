import { prisma } from '../../../_lib/prisma.js';
import { requireMember } from '../../../_lib/authz.js';
import { listMembers } from '../../../_lib/organizations.js';

export default async function handler(req, res, client = prisma) {
  const ctx = await requireMember(req, res, { client, role: 'owner' });
  if (!ctx) return;

  if (req.query?.id !== ctx.orgId) {
    res.status(404).json({ error: 'Organización no encontrada.' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    res.status(200).json(await listMembers(client, ctx.orgId));
  } catch (err) {
    console.error('Error listando miembros:', err);
    res.status(500).json({ error: 'No se han podido listar los miembros.' });
  }
}
