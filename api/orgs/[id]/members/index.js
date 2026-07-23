import { prisma } from '../../../_lib/prisma.js';
import { requireMember } from '../../../_lib/authz.js';
import { listMembers } from '../../../_lib/organizations.js';
import { getUserEmails } from '../../../_lib/supabaseAdmin.js';

// `resolveEmails` es inyectable para tests (mismo patrón que `inviteUser` en
// invitations.js); en producción cae al resolver real vía service-role.
export default async function handler(req, res, client = prisma, { resolveEmails = getUserEmails } = {}) {
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
    const members = await listMembers(client, ctx.orgId);
    // El email es un enriquecimiento best-effort: si el resolver falla, seguimos
    // devolviendo la lista (la UI cae al uuid) en vez de tumbar toda la pantalla.
    let emails = {};
    try {
      emails = await resolveEmails(members.map((member) => member.userId));
    } catch (err) {
      console.error('Error resolviendo emails de miembros:', err);
    }
    res.status(200).json(members.map((member) => ({
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      email: emails[member.userId] ?? null,
    })));
  } catch (err) {
    console.error('Error listando miembros:', err);
    res.status(500).json({ error: 'No se han podido listar los miembros.' });
  }
}
