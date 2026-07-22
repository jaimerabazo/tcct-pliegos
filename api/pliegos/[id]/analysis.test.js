// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect } from 'vitest';
import handler, { updateAnalysis } from './analysis.js';
import { createFakePliegoPrisma } from '../../_lib/testFakePrisma.js';
import { createFakeRes } from '../../_lib/testFakeRes.js';
import { authHeaders, TEST_USER } from '../../_lib/testAuth.js';
import { MOCK_ANALYSIS } from '../../../prisma/seed.js';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const tenancy = {
  organizations: [
    { id: ORG_A, name: 'Org A', slug: 'org-a' },
    { id: ORG_B, name: 'Org B', slug: 'org-b' },
  ],
  memberships: [{ userId: TEST_USER.id, organizationId: ORG_A, role: 'member' }],
};

// Token válido + org activa, como los mandaría el frontend real.
const headers = { ...(await authHeaders()), 'x-organization-id': ORG_A };

const validAnalysis = MOCK_ANALYSIS['2026-7008'];

const baseRow = {
  id: 'a',
  organizationId: ORG_A,
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

const rowDeB = { ...baseRow, id: 'b', organizationId: ORG_B, expediente: '2026/0009' };

const fakePrisma = (rows = [baseRow, rowDeB]) => createFakePliegoPrisma(rows, tenancy);

describe('updateAnalysis (scoped)', () => {
  it('sustituye analysisData por el objeto completo y firma updatedBy', async () => {
    const updated = await updateAnalysis(fakePrisma(), 'a', ORG_A, validAnalysis, TEST_USER.id);
    expect(updated.analysisData).toEqual(validAnalysis);
    expect(updated.updatedBy).toBe(TEST_USER.id);
  });

  it('lanza P2025 si el pliego no existe', async () => {
    await expect(updateAnalysis(fakePrisma([]), 'no-existe', ORG_A, validAnalysis)).rejects.toMatchObject({ code: 'P2025' });
  });

  it('lanza P2025 si el pliego es de OTRA org, y su analysisData queda intacto', async () => {
    const prisma = fakePrisma();
    await expect(updateAnalysis(prisma, 'b', ORG_A, validAnalysis)).rejects.toMatchObject({ code: 'P2025' });
    const intacto = await prisma.pliego.findUnique({ where: { id: 'b' } });
    expect(intacto.analysisData).toBeNull();
  });
});

describe('handler PATCH /api/pliegos/[id]/analysis', () => {
  it('responde 401 sin token o con token inválido', async () => {
    let res = createFakeRes();
    await handler({ method: 'PATCH', headers: {}, query: { id: 'a' }, body: validAnalysis }, res, fakePrisma());
    expect(res.statusCode).toBe(401);
    res = createFakeRes();
    await handler({ method: 'PATCH', headers: { authorization: 'Bearer basura' }, query: { id: 'a' }, body: validAnalysis }, res, fakePrisma());
    expect(res.statusCode).toBe(401);
  });

  it('responde 400 sin cabecera X-Organization-Id', async () => {
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers: await authHeaders(), query: { id: 'a' }, body: validAnalysis }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
  });

  it('responde 403 si afirma una org donde no tiene membership', async () => {
    const res = createFakeRes();
    const reqHeaders = { ...(await authHeaders()), 'x-organization-id': ORG_B };
    await handler({ method: 'PATCH', headers: reqHeaders, query: { id: 'b' }, body: validAnalysis }, res, fakePrisma());
    expect(res.statusCode).toBe(403);
  });

  it('responde 200 con el analysisData actualizado', async () => {
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: validAnalysis }, res, fakePrisma());
    expect(res.statusCode).toBe(200);
    expect(res.body.analysisData).toEqual(validAnalysis);
    expect(res.body.updatedBy).toBe(TEST_USER.id);
  });

  it('responde 400 si falta una sección requerida', async () => {
    const res = createFakeRes();
    const { lotes, ...incompleto } = validAnalysis;
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: incompleto }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toBeTruthy();
  });

  it('responde 400 si criterios[].tipo no es un valor válido', async () => {
    const res = createFakeRes();
    const invalido = { ...validAnalysis, criterios: [{ tipo: 'otro', criterio: 'X', peso: 10 }] };
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: invalido }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
  });

  it('responde 404 si el pliego no existe', async () => {
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'no-existe' }, body: validAnalysis }, res, fakePrisma([]));
    expect(res.statusCode).toBe(404);
  });

  it('responde 404 para un pliego de OTRA org, que queda intacto', async () => {
    const prisma = fakePrisma();
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'b' }, body: validAnalysis }, res, prisma);
    expect(res.statusCode).toBe(404);
    const intacto = await prisma.pliego.findUnique({ where: { id: 'b' } });
    expect(intacto.analysisData).toBeNull();
  });

  it('responde 500 ante un error inesperado', async () => {
    const prisma = fakePrisma();
    prisma.pliego.update = () => { throw new Error('boom'); };
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: validAnalysis }, res, prisma);
    expect(res.statusCode).toBe(500);
  });

  it('responde 405 para métodos no soportados', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'a' } }, res, fakePrisma());
    expect(res.statusCode).toBe(405);
  });
});
