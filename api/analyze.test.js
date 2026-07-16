// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect } from 'vitest';
import handler, { toPliegoRowFromAnalysis, persistAnalysis } from './analyze.js';
import { createFakePliegoPrisma } from './_lib/testFakePrisma.js';
import { createFakeRes } from './_lib/testFakeRes.js';
import './_lib/testAuth.js'; // instala el secret de test para el guard de auth
import { MOCK_ANALYSIS } from '../prisma/seed.js';

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

describe('persistAnalysis', () => {
  it('crea una fila nueva cuando el expediente no existía', async () => {
    const prisma = createFakePliegoPrisma([]);
    const saved = await persistAnalysis(prisma, sampleResult);
    expect(saved.expediente).toBe('2026/9999');
    expect(saved.id).toBeTruthy();
  });

  it('es idempotente: analizar dos veces el mismo expediente actualiza, no duplica', async () => {
    const prisma = createFakePliegoPrisma([]);
    await persistAnalysis(prisma, sampleResult);

    const segundaVuelta = {
      ...sampleResult,
      pliego: { ...sampleResult.pliego, importe: 2000000 },
    };
    await persistAnalysis(prisma, segundaVuelta);

    const todos = await prisma.pliego.findMany();
    expect(todos).toHaveLength(1);
    expect(todos[0].importe).toBe(2000000);
  });
});

// El handler completo (llamada real a Claude) se verifica a mano, no por CI — pero el
// guard de auth corre ANTES de leer el body o tocar Claude, así que sí es testeable.
describe('handler POST /api/analyze — auth', () => {
  it('responde 401 sin token, antes de gastar nada', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('responde 401 con token inválido', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer basura' } }, res);
    expect(res.statusCode).toBe(401);
  });
});
