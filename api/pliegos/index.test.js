// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect } from 'vitest';
import handler, { listPliegos } from './index.js';
import { createFakePliegoPrisma } from '../_lib/testFakePrisma.js';
import { createFakeRes } from '../_lib/testFakeRes.js';
import { authHeaders } from '../_lib/testAuth.js';

const rowA = { id: 'a', expediente: '2026/0001', fechaAnalisis: new Date('2026-01-01') };
const rowB = { id: 'b', expediente: '2026/0002', fechaAnalisis: new Date('2026-02-01') };

// Token válido compartido por todos los tests del handler (firmado con el secret de test).
const headers = await authHeaders();

describe('listPliegos', () => {
  it('devuelve los pliegos ordenados por fechaAnalisis descendente', async () => {
    const prisma = createFakePliegoPrisma([rowA, rowB]);
    const result = await listPliegos(prisma);
    expect(result.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('devuelve un array vacío si no hay pliegos', async () => {
    const prisma = createFakePliegoPrisma([]);
    expect(await listPliegos(prisma)).toEqual([]);
  });
});

describe('handler GET /api/pliegos', () => {
  it('responde 200 con la lista', async () => {
    const prisma = createFakePliegoPrisma([rowA, rowB]);
    const req = { method: 'GET', headers };
    const res = createFakeRes();

    await handler(req, res, prisma);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('responde 401 sin token (y no toca la BD)', async () => {
    const prisma = createFakePliegoPrisma([rowA]);
    const res = createFakeRes();

    await handler({ method: 'GET', headers: {} }, res, prisma);

    expect(res.statusCode).toBe(401);
  });

  it('responde 401 con un token inválido', async () => {
    const prisma = createFakePliegoPrisma([rowA]);
    const res = createFakeRes();

    await handler({ method: 'GET', headers: { authorization: 'Bearer basura' } }, res, prisma);

    expect(res.statusCode).toBe(401);
  });

  it('responde 405 para métodos que no sean GET', async () => {
    const prisma = createFakePliegoPrisma([]);
    const req = { method: 'POST', headers };
    const res = createFakeRes();

    await handler(req, res, prisma);

    expect(res.statusCode).toBe(405);
  });

  it('responde 500 si falla la consulta', async () => {
    const prisma = { pliego: { findMany: () => { throw new Error('boom'); } } };
    const req = { method: 'GET', headers };
    const res = createFakeRes();

    await handler(req, res, prisma);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});
