import { prisma } from '../../_lib/prisma.js';
import { analysisDataSchema } from '../../_lib/schemas.js';
import { requireMember } from '../../_lib/authz.js';
import { withTenant } from '../../_lib/tenantDb.js';

// Núcleo testable — ver api/_lib/testFakePrisma.js para el doble usado en tests.
// Mismo patrón scoped que updatePliego (api/pliegos/[id].js): verificar pertenencia
// con la query scoped, actualizar por id, y P2025 → 404 (cross-tenant no revela nada).
export async function updateAnalysis(client, id, organizationId, analysisData, updatedBy = null) {
  const existing = await client.pliego.findFirst({ where: { id, organizationId } });
  if (!existing) {
    const err = new Error('Pliego no encontrado en esta organización.');
    err.code = 'P2025';
    throw err;
  }
  return client.pliego.update({ where: { id }, data: { analysisData, updatedBy } });
}

// `client` es inyectable para tests (ver api/pliegos/[id]/analysis.test.js); Vercel
// siempre lo llama con dos argumentos, así que en producción cae al singleton real.
export default async function handler(req, res, client = prisma) {
  const ctx = await requireMember(req, res, { client });
  if (!ctx) return; // requireMember ya ha respondido 400/401/403/500

  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  const { id } = req.query;
  const result = analysisDataSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Datos de análisis inválidos.', details: result.error.flatten() });
    return;
  }

  try {
    const updated = await withTenant(client, ctx.orgId, (db) => updateAnalysis(
      db, id, ctx.orgId, result.data, ctx.user.id,
    ));
    res.status(200).json(updated);
  } catch (err) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Pliego no encontrado.' });
      return;
    }
    console.error('Error actualizando el análisis:', err);
    res.status(500).json({ error: 'No se ha podido actualizar el análisis.' });
  }
}
