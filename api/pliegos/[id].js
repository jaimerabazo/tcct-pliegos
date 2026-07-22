import { prisma } from '../_lib/prisma.js';
import { pliegoPatchSchema } from '../_lib/schemas.js';
import { requireMember } from '../_lib/authz.js';

// Núcleo testable — ver api/_lib/testFakePrisma.js para el doble usado en tests.
//
// Bloque 3: las queries van scoped por organizationId. Un pliego de OTRA org no
// "existe" para esta request → findFirst devuelve null → 404 (no 403: el scoping
// correcto no revela ni la existencia — BLOQUE-1 §3).
export async function getPliego(client, id, organizationId) {
  return client.pliego.findFirst({ where: { id, organizationId } });
}

// `update` de Prisma exige un where único, y (id, organizationId) no lo es — así que
// primero verificamos la pertenencia con la query scoped y luego actualizamos por id.
// Se lanza un error con code P2025 (el mismo que usa Prisma para "no encontrado") para
// que el handler lo traduzca a 404 igual que antes. La ventanita entre ambas queries la
// cierra el RLS en la fase 5 (defensa en profundidad, no una carrera que nos preocupe).
export async function updatePliego(client, id, organizationId, data) {
  const existing = await client.pliego.findFirst({ where: { id, organizationId } });
  if (!existing) {
    const err = new Error('Pliego no encontrado en esta organización.');
    err.code = 'P2025';
    throw err;
  }
  return client.pliego.update({ where: { id }, data });
}

// `client` es inyectable para tests (ver api/pliegos/[id].test.js); Vercel siempre
// lo llama con dos argumentos, así que en producción cae al singleton real.
export default async function handler(req, res, client = prisma) {
  const ctx = await requireMember(req, res, { client });
  if (!ctx) return; // requireMember ya ha respondido 400/401/403/500

  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const pliego = await getPliego(client, id, ctx.orgId);
      if (!pliego) {
        res.status(404).json({ error: 'Pliego no encontrado.' });
        return;
      }
      res.status(200).json(pliego);
    } catch (err) {
      console.error('Error obteniendo el pliego:', err);
      res.status(500).json({ error: 'No se ha podido obtener el pliego.' });
    }
    return;
  }

  if (req.method === 'PATCH') {
    const result = pliegoPatchSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Datos inválidos.', details: result.error.flatten() });
      return;
    }
    try {
      // updatedBy: audit ligero de quién tocó la fila por última vez (BLOQUE-1 §1).
      const updated = await updatePliego(client, id, ctx.orgId, { ...result.data, updatedBy: ctx.user.id });
      res.status(200).json(updated);
    } catch (err) {
      if (err.code === 'P2025') {
        res.status(404).json({ error: 'Pliego no encontrado.' });
        return;
      }
      console.error('Error actualizando el pliego:', err);
      res.status(500).json({ error: 'No se ha podido actualizar el pliego.' });
    }
    return;
  }

  res.status(405).json({ error: 'Método no permitido.' });
}
