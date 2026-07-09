import { describe, it, expect } from 'vitest';
import handler, { listPliegos } from './index.js';
import { createFakePliegoPrisma } from '../_lib/testFakePrisma.js';
import { createFakeRes } from '../_lib/testFakeRes.js';

const rowA = { id: 'a', expediente: '2026/0001', fechaAnalisis: new Date('2026-01-01') };
const rowB = { id: 'b', expediente: '2026/0002', fechaAnalisis: new Date('2026-02-01') };

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
    const req = { method: 'GET' };
    const res = createFakeRes();

    await handler(req, res, prisma);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('responde 405 para métodos que no sean GET', async () => {
    const prisma = createFakePliegoPrisma([]);
    const req = { method: 'POST' };
    const res = createFakeRes();

    await handler(req, res, prisma);

    expect(res.statusCode).toBe(405);
  });

  it('responde 500 si falla la consulta', async () => {
    const prisma = { pliego: { findMany: () => { throw new Error('boom'); } } };
    const req = { method: 'GET' };
    const res = createFakeRes();

    await handler(req, res, prisma);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});
