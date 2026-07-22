import { prisma } from '../_lib/prisma.js';
import { requireMember } from '../_lib/authz.js';

// Núcleo testable (recibe el cliente Prisma por parámetro, ver api/_lib/testFakePrisma.js).
// Bloque 3: la query SIEMPRE filtra por organizationId — regla de oro del tenancy
// (docs/ARQUITECTURA-SAAS.md §3). Nunca un findMany sin org.
export async function listPliegos(client, organizationId) {
  return client.pliego.findMany({
    where: { organizationId },
    orderBy: { fechaAnalisis: 'desc' },
  });
}

// `client` es inyectable para tests (ver api/pliegos/index.test.js); Vercel siempre
// lo llama con dos argumentos, así que en producción cae al singleton real.
export default async function handler(req, res, client = prisma) {
  const ctx = await requireMember(req, res, { client });
  if (!ctx) return; // requireMember ya ha respondido 400/401/403/500

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    const pliegos = await listPliegos(client, ctx.orgId);
    res.status(200).json(pliegos);
  } catch (err) {
    console.error('Error listando pliegos:', err);
    res.status(500).json({ error: 'No se han podido listar los pliegos.' });
  }
}
