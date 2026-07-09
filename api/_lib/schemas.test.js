import { describe, it, expect } from 'vitest';
import { pliegoPatchSchema, analysisDataSchema, pliegoFromAnalysisSchema } from './schemas.js';
import { MOCK_ANALYSIS } from '../../prisma/seed.js';

const validAnalysis = MOCK_ANALYSIS['2026-7008'];

describe('pliegoPatchSchema', () => {
  it('acepta un patch parcial válido', () => {
    const result = pliegoPatchSchema.safeParse({ importe: 3000000 });
    expect(result.success).toBe(true);
  });

  it('acepta un objeto vacío (ningún campo obligatorio)', () => {
    expect(pliegoPatchSchema.safeParse({}).success).toBe(true);
  });

  it('rechaza campos desconocidos (id, expediente, analysisData no se tocan aquí)', () => {
    expect(pliegoPatchSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(pliegoPatchSchema.safeParse({ expediente: '2026/9999' }).success).toBe(false);
    expect(pliegoPatchSchema.safeParse({ analysisData: {} }).success).toBe(false);
  });

  it('rechaza un estado que no sea uno de los válidos', () => {
    expect(pliegoPatchSchema.safeParse({ estado: 'inventado' }).success).toBe(false);
  });

  it('acepta los 4 estados válidos', () => {
    for (const estado of ['analizado', 'procesando', 'revision', 'error']) {
      expect(pliegoPatchSchema.safeParse({ estado }).success).toBe(true);
    }
  });

  it('convierte un string ISO de fechaLimite en Date', () => {
    const result = pliegoPatchSchema.safeParse({ fechaLimite: '2026-07-15T00:00:00.000Z' });
    expect(result.success).toBe(true);
    expect(result.data.fechaLimite).toBeInstanceOf(Date);
  });

  it('rechaza importe con el tipo equivocado', () => {
    expect(pliegoPatchSchema.safeParse({ importe: 'mucho' }).success).toBe(false);
  });
});

describe('analysisDataSchema', () => {
  it('acepta el shape completo de un análisis real', () => {
    expect(analysisDataSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it('rechaza si falta una sección requerida', () => {
    const { plazos, ...incompleto } = validAnalysis;
    expect(analysisDataSchema.safeParse(incompleto).success).toBe(false);
  });

  it('rechaza criterios[].tipo fuera del enum', () => {
    const invalido = { ...validAnalysis, criterios: [{ tipo: 'quizas', criterio: 'X', peso: 10 }] };
    expect(analysisDataSchema.safeParse(invalido).success).toBe(false);
  });

  it('rechaza un lote sin los campos requeridos', () => {
    const invalido = { ...validAnalysis, lotes: [{ numero: 1 }] };
    expect(analysisDataSchema.safeParse(invalido).success).toBe(false);
  });

  it('rechaza propiedades adicionales no contempladas', () => {
    const invalido = { ...validAnalysis, campoInventado: true };
    expect(analysisDataSchema.safeParse(invalido).success).toBe(false);
  });
});

describe('pliegoFromAnalysisSchema', () => {
  const validPliego = {
    expediente: '2026/7008',
    titulo: 'Soporte Técnico de Sistemas',
    organismo: 'GISS',
    importe: 18500000,
    lotes: 3,
    fechaLimite: '15 jul 2026',
    procedimiento: 'Abierto SARA',
    ens: 'Alto',
  };

  it('acepta el shape que devuelve Claude', () => {
    expect(pliegoFromAnalysisSchema.safeParse(validPliego).success).toBe(true);
  });

  it('rechaza si falta un campo requerido', () => {
    const { expediente, ...incompleto } = validPliego;
    expect(pliegoFromAnalysisSchema.safeParse(incompleto).success).toBe(false);
  });

  it('rechaza strings vacíos en campos de texto', () => {
    expect(pliegoFromAnalysisSchema.safeParse({ ...validPliego, titulo: '' }).success).toBe(false);
  });
});
