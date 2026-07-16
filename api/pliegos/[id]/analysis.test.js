// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect } from 'vitest';
import handler, { updateAnalysis } from './analysis.js';
import { createFakePliegoPrisma } from '../../_lib/testFakePrisma.js';
import { createFakeRes } from '../../_lib/testFakeRes.js';
import { authHeaders } from '../../_lib/testAuth.js';
import { MOCK_ANALYSIS } from '../../../prisma/seed.js';

// Token válido compartido por todos los tests del handler (firmado con el secret de test).
const headers = await authHeaders();

const validAnalysis = MOCK_ANALYSIS['2026-7008'];

const baseRow = {
  id: 'a',
  expediente: '2026/0001',
  titulo: 'Pliego de prueba',
  organismo: 'Organismo de Prueba',
  importe: 1000000,
  lotes: 1,
  estado: 'analizado',
  procedimiento: 'Abierto',
  ens: 'Alto',
  fechaAnalisis: new Date('2026-01-01'),
  analysisData: null,
};

describe('updateAnalysis', () => {
  it('sustituye analysisData por el objeto completo', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const updated = await updateAnalysis(prisma, 'a', validAnalysis);
    expect(updated.analysisData).toEqual(validAnalysis);
  });

  it('lanza P2025 si el pliego no existe', async () => {
    const prisma = createFakePliegoPrisma([]);
    await expect(updateAnalysis(prisma, 'no-existe', validAnalysis)).rejects.toMatchObject({ code: 'P2025' });
  });
});

describe('handler PATCH /api/pliegos/[id]/analysis', () => {
  it('responde 401 sin token o con token inválido', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    let res = createFakeRes();
    await handler({ method: 'PATCH', headers: {}, query: { id: 'a' }, body: validAnalysis }, res, prisma);
    expect(res.statusCode).toBe(401);
    res = createFakeRes();
    await handler({ method: 'PATCH', headers: { authorization: 'Bearer basura' }, query: { id: 'a' }, body: validAnalysis }, res, prisma);
    expect(res.statusCode).toBe(401);
  });

  it('responde 200 con el analysisData actualizado', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: validAnalysis }, res, prisma);
    expect(res.statusCode).toBe(200);
    expect(res.body.analysisData).toEqual(validAnalysis);
  });

  it('responde 400 si falta una sección requerida', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    const { lotes, ...incompleto } = validAnalysis;
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: incompleto }, res, prisma);
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toBeTruthy();
  });

  it('responde 400 si criterios[].tipo no es un valor válido', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    const invalido = { ...validAnalysis, criterios: [{ tipo: 'otro', criterio: 'X', peso: 10 }] };
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: invalido }, res, prisma);
    expect(res.statusCode).toBe(400);
  });

  it('responde 404 si el pliego no existe', async () => {
    const prisma = createFakePliegoPrisma([]);
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'no-existe' }, body: validAnalysis }, res, prisma);
    expect(res.statusCode).toBe(404);
  });

  it('responde 500 ante un error inesperado', async () => {
    const prisma = { pliego: { update: () => { throw new Error('boom'); } } };
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: validAnalysis }, res, prisma);
    expect(res.statusCode).toBe(500);
  });

  it('responde 405 para métodos no soportados', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'a' } }, res, prisma);
    expect(res.statusCode).toBe(405);
  });
});
