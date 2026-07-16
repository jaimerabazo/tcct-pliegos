import { prisma } from '../../_lib/prisma.js';
import { analysisDataSchema } from '../../_lib/schemas.js';
import { requireUser } from '../../_lib/auth.js';

// Núcleo testable — ver api/_lib/testFakePrisma.js para el doble usado en tests.
export async function updateAnalysis(client, id, analysisData) {
  return client.pliego.update({ where: { id }, data: { analysisData } });
}

// `client` es inyectable para tests (ver api/pliegos/[id]/analysis.test.js); Vercel
// siempre lo llama con dos argumentos, así que en producción cae al singleton real.
export default async function handler(req, res, client = prisma) {
  const user = await requireUser(req, res);
  if (!user) return; // requireUser ya ha respondido 401/500

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
    const updated = await updateAnalysis(client, id, result.data);
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
