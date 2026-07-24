import { prisma } from '../_lib/prisma.js';
import { requireUser } from '../_lib/auth.js';
import { organizationCreateSchema } from '../_lib/schemas.js';
import { createOrganization } from '../_lib/organizations.js';

// GET /api/orgs — las organizaciones del usuario autenticado (con su rol en cada una).
//
// Es el endpoint de BOOTSTRAP del frontend: se llama nada más iniciar sesión para saber
// qué org activar, así que usa requireUser y NO requireMember — todavía no hay org en el
// contexto (el huevo y la gallina: este endpoint es quien le dice al cliente qué orgs
// puede afirmar en X-Organization-Id).
export async function listMyOrgs(client, userId) {
  const memberships = await client.membership.findMany({
    where: { userId },
    include: { organization: true },
  });
  return memberships
    // Una org en ventana de purga (soft-delete, D3) no se ofrece como activable.
    .filter((m) => m.organization && !m.organization.deletedAt)
    .map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      plan: m.organization.plan,
      role: m.role,
    }));
}

// `client` es inyectable para tests; Vercel siempre llama con dos argumentos, así que
// en producción cae al singleton real.
export default async function handler(req, res, client = prisma) {
  const user = await requireUser(req, res);
  if (!user) return; // requireUser ya ha respondido 401/500

  if (!['GET', 'POST'].includes(req.method)) {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      res.status(200).json(await listMyOrgs(client, user.id));
      return;
    }

    const parsed = organizationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'El nombre de la organización no es válido.', details: parsed.error.issues });
      return;
    }
    const organization = await createOrganization(client, {
      name: parsed.data.name,
      userId: user.id,
    });
    res.status(201).json(organization);
  } catch (err) {
    console.error('Error gestionando organizaciones:', err);
    res.status(500).json({
      error: req.method === 'POST'
        ? 'No se ha podido crear la organización.'
        : 'No se han podido listar las organizaciones.',
    });
  }
}
