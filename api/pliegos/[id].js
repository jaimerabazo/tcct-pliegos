import { prisma } from '../_lib/prisma.js';
import { pliegoPatchSchema } from '../_lib/schemas.js';

// Núcleo testable — ver api/_lib/testFakePrisma.js para el doble usado en tests.
export async function getPliego(client, id) {
  return client.pliego.findUnique({ where: { id } });
}

export async function updatePliego(client, id, patch) {
  return client.pliego.update({ where: { id }, data: patch });
}

// `client` es inyectable para tests (ver api/pliegos/[id].test.js); Vercel siempre
// lo llama con dos argumentos, así que en producción cae al singleton real.
export default async function handler(req, res, client = prisma) {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const pliego = await getPliego(client, id);
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
      const updated = await updatePliego(client, id, result.data);
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
