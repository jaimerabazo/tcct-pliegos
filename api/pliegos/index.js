import { prisma } from '../_lib/prisma.js';

// Núcleo testable (recibe el cliente Prisma por parámetro, ver api/_lib/testFakePrisma.js).
export async function listPliegos(client) {
  return client.pliego.findMany({ orderBy: { fechaAnalisis: 'desc' } });
}

// `client` es inyectable para tests (ver api/pliegos/index.test.js); Vercel siempre
// lo llama con dos argumentos, así que en producción cae al singleton real.
export default async function handler(req, res, client = prisma) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  try {
    const pliegos = await listPliegos(client);
    res.status(200).json(pliegos);
  } catch (err) {
    console.error('Error listando pliegos:', err);
    res.status(500).json({ error: 'No se han podido listar los pliegos.' });
  }
}
