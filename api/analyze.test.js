// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect } from 'vitest';
import handler, { toPliegoRowFromAnalysis, persistAnalysis } from './analyze.js';
import { createFakePliegoPrisma } from './_lib/testFakePrisma.js';
import { createFakeRes } from './_lib/testFakeRes.js';
import { authHeaders, TEST_USER } from './_lib/testAuth.js'; // instala el secret de test para el guard
import { MOCK_ANALYSIS } from '../prisma/seed.js';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const tenancy = {
  organizations: [
    { id: ORG_A, name: 'Org A', slug: 'org-a' },
    { id: ORG_B, name: 'Org B', slug: 'org-b' },
  ],
  memberships: [{ userId: TEST_USER.id, organizationId: ORG_A, role: 'member' }],
};
const CTX_A = { organizationId: ORG_A, userId: TEST_USER.id };

const sampleResult = {
  pliego: {
    expediente: '2026/9999',
    titulo: 'Pliego de prueba',
    organismo: 'Organismo de Prueba',
    importe: 1000000,
    lotes: 1,
    fechaLimite: '15 jul 2026',
    procedimiento: 'Abierto',
    ens: 'Alto',
  },
  analysis: MOCK_ANALYSIS['2026-7008'],
};

describe('toPliegoRowFromAnalysis', () => {
  it('mapea los campos escalares del pliego', () => {
    const row = toPliegoRowFromAnalysis(sampleResult);
    expect(row).toMatchObject({
      expediente: '2026/9999',
      titulo: 'Pliego de prueba',
      organismo: 'Organismo de Prueba',
      importe: 1000000,
      lotes: 1,
      procedimiento: 'Abierto',
      ens: 'Alto',
      estado: 'analizado',
    });
  });

  it('convierte fechaLimite (string corto) en Date', () => {
    const row = toPliegoRowFromAnalysis(sampleResult);
    expect(row.fechaLimite).toBeInstanceOf(Date);
  });

  it('deja fechaLimite en null cuando Claude devuelve "No especificado"', () => {
    // Antes esto producía un Invalid Date que hacía fallar el upsert de Prisma
    // (502 genérico). fechaLimite es nullable, así que null es lo correcto.
    const row = toPliegoRowFromAnalysis({
      ...sampleResult,
      pliego: { ...sampleResult.pliego, fechaLimite: 'No especificado' },
    });
    expect(row.fechaLimite).toBeNull();
  });

  it('fija fechaAnalisis a la fecha actual', () => {
    const before = Date.now();
    const row = toPliegoRowFromAnalysis(sampleResult);
    expect(row.fechaAnalisis).toBeInstanceOf(Date);
    expect(row.fechaAnalisis.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('adjunta el bloque analysis completo como analysisData', () => {
    const row = toPliegoRowFromAnalysis(sampleResult);
    expect(row.analysisData).toBe(sampleResult.analysis);
  });
});

describe('persistAnalysis (scoped por organización)', () => {
  it('crea una fila nueva con organizationId y createdBy cuando el expediente no existía en la org', async () => {
    const prisma = createFakePliegoPrisma([], tenancy);
    const saved = await persistAnalysis(prisma, sampleResult, CTX_A);
    expect(saved.expediente).toBe('2026/9999');
    expect(saved.organizationId).toBe(ORG_A);
    expect(saved.createdBy).toBe(TEST_USER.id);
    expect(saved.id).toBeTruthy();
  });

  it('es idempotente POR ORG: re-analizar el mismo expediente actualiza (y firma updatedBy), no duplica', async () => {
    const prisma = createFakePliegoPrisma([], tenancy);
    await persistAnalysis(prisma, sampleResult, CTX_A);

    const segundaVuelta = {
      ...sampleResult,
      pliego: { ...sampleResult.pliego, importe: 2000000 },
    };
    await persistAnalysis(prisma, segundaVuelta, CTX_A);

    const todos = await prisma.pliego.findMany();
    expect(todos).toHaveLength(1);
    expect(todos[0].importe).toBe(2000000);
    expect(todos[0].updatedBy).toBe(TEST_USER.id);
  });

  it('dos orgs pueden analizar el MISMO expediente sin pisarse (el bug del @unique global)', async () => {
    const prisma = createFakePliegoPrisma([], tenancy);
    await persistAnalysis(prisma, sampleResult, CTX_A);
    await persistAnalysis(prisma, sampleResult, { organizationId: ORG_B, userId: 'user-de-b' });

    const todos = await prisma.pliego.findMany();
    expect(todos).toHaveLength(2);
    expect(new Set(todos.map((p) => p.organizationId))).toEqual(new Set([ORG_A, ORG_B]));
  });
});

// El handler completo (llamada real a Claude) se verifica a mano, no por CI — pero el
// guard de auth/org corre ANTES de leer el body o tocar Claude, así que sí es testeable.
describe('handler POST /api/analyze — guard', () => {
  it('responde 401 sin token, antes de gastar nada', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: {} }, res, createFakePliegoPrisma([], tenancy));
    expect(res.statusCode).toBe(401);
  });

  it('responde 401 con token inválido', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer basura' } }, res, createFakePliegoPrisma([], tenancy));
    expect(res.statusCode).toBe(401);
  });

  it('responde 400 sin cabecera X-Organization-Id', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: await authHeaders() }, res, createFakePliegoPrisma([], tenancy));
    expect(res.statusCode).toBe(400);
  });

  it('responde 403 si afirma una org donde no tiene membership', async () => {
    const res = createFakeRes();
    const headers = { ...(await authHeaders()), 'x-organization-id': ORG_B };
    await handler({ method: 'POST', headers }, res, createFakePliegoPrisma([], tenancy));
    expect(res.statusCode).toBe(403);
  });
});
