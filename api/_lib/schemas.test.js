import { describe, it, expect } from 'vitest';
import { pliegoPatchSchema, analysisDataSchema, pliegoFromAnalysisSchema, presentationContentSchema, presentationRequestSchema } from './schemas.js';
import { MOCK_PLIEGOS, MOCK_ANALYSIS } from '../../prisma/seed.js';

const validAnalysis = MOCK_ANALYSIS['2026-7008'];

// Cómo llega el pliego desde el frontend (fila normalizada + analysisData incluido).
const validPresentationRequest = {
  ...MOCK_PLIEGOS.find((p) => p.id === '2026-7008'),
  analysisData: validAnalysis,
};

const validPresentationContent = {
  tagline: 'Análisis para Comité de Ofertas',
  resumenFinal: {
    titulares: ['Contrato marco de soporte a GISS', '18,5 M€ en 3 lotes'],
    puntosFuertes: ['Certificaciones ENS Alto en regla'],
    riesgos: ['El precio pesa un 40%'],
    recomendacion: 'Presentar oferta a los tres lotes.',
  },
};

describe('pliegoPatchSchema', () => {
  it('acepta un patch parcial válido', () => {
    const result = pliegoPatchSchema.safeParse({ importe: 3000000 });
    expect(result.success).toBe(true);
  });

  it('rechaza un objeto vacío (Prisma rechaza un update sin data)', () => {
    expect(pliegoPatchSchema.safeParse({}).success).toBe(false);
  });

  it('rechaza campos desconocidos (id, expediente no se tocan aquí)', () => {
    expect(pliegoPatchSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(pliegoPatchSchema.safeParse({ expediente: '2026/9999' }).success).toBe(false);
  });

  it('acepta analysisData válido (patch combinado atómico cabecera + análisis)', () => {
    expect(pliegoPatchSchema.safeParse({ analysisData: validAnalysis }).success).toBe(true);
    expect(pliegoPatchSchema.safeParse({ importe: 3000000, analysisData: validAnalysis }).success).toBe(true);
  });

  it('rechaza un analysisData con shape inválido', () => {
    expect(pliegoPatchSchema.safeParse({ analysisData: {} }).success).toBe(false);
    expect(pliegoPatchSchema.safeParse({ analysisData: { lotes: [{ numero: 1 }] } }).success).toBe(false);
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

  it('acepta importe null (campo vacío "sin valor"), pero no ""', () => {
    expect(pliegoPatchSchema.safeParse({ importe: null }).success).toBe(true);
    expect(pliegoPatchSchema.safeParse({ importe: '' }).success).toBe(false);
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

  it('acepta null en los campos numéricos editables (hueco "sin valor")', () => {
    const conNulos = {
      ...validAnalysis,
      lotes: validAnalysis.lotes.map(l => ({ ...l, importe: null })),
      perfiles: validAnalysis.perfiles.map(p => ({ ...p, headcount: null, experiencia: null })),
      solvencia: {
        tecnica: { ...validAnalysis.solvencia.tecnica, volumenNegocio: null },
        economica: { seguroRC: null, capitalMinimo: null },
      },
      criterios: validAnalysis.criterios.map(c => ({ ...c, peso: null })),
    };
    expect(analysisDataSchema.safeParse(conNulos).success).toBe(true);
  });

  it('sigue rechazando "" en los campos numéricos (solo número o null)', () => {
    const conVacio = { ...validAnalysis, lotes: validAnalysis.lotes.map(l => ({ ...l, importe: '' })) };
    expect(analysisDataSchema.safeParse(conVacio).success).toBe(false);
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

describe('presentationContentSchema', () => {
  it('acepta el contenido que devuelve Claude para la presentación', () => {
    expect(presentationContentSchema.safeParse(validPresentationContent).success).toBe(true);
  });

  it('acepta tagline vacío y arrays/recomendación vacíos (el builder los omite)', () => {
    const vacio = {
      tagline: '',
      resumenFinal: { titulares: [], puntosFuertes: [], riesgos: [], recomendacion: '' },
    };
    expect(presentationContentSchema.safeParse(vacio).success).toBe(true);
  });

  it('rechaza si falta resumenFinal', () => {
    expect(presentationContentSchema.safeParse({ tagline: 'x' }).success).toBe(false);
  });

  it('rechaza si falta un campo de resumenFinal', () => {
    const { riesgos, ...incompleto } = validPresentationContent.resumenFinal;
    expect(presentationContentSchema.safeParse({ tagline: 'x', resumenFinal: incompleto }).success).toBe(false);
  });

  it('rechaza titulares que no son array de strings', () => {
    const malo = {
      ...validPresentationContent,
      resumenFinal: { ...validPresentationContent.resumenFinal, titulares: [1, 2] },
    };
    expect(presentationContentSchema.safeParse(malo).success).toBe(false);
  });

  it('rechaza campos desconocidos (strict)', () => {
    const extra = { ...validPresentationContent, foo: 'bar' };
    expect(presentationContentSchema.safeParse(extra).success).toBe(false);
    const extraNested = {
      ...validPresentationContent,
      resumenFinal: { ...validPresentationContent.resumenFinal, foo: 'bar' },
    };
    expect(presentationContentSchema.safeParse(extraNested).success).toBe(false);
  });
});

describe('presentationRequestSchema', () => {
  it('acepta el pliego que manda el frontend (cabecera + analysisData)', () => {
    expect(presentationRequestSchema.safeParse(validPresentationRequest).success).toBe(true);
  });

  it('tolera campos extra de la fila (id, estado, fechaAnalisis) vía passthrough', () => {
    const conExtras = { ...validPresentationRequest, id: '2026-7008', estado: 'analizado', fechaAnalisis: '04 jul 2026' };
    const result = presentationRequestSchema.safeParse(conExtras);
    expect(result.success).toBe(true);
    expect(result.data.id).toBe('2026-7008');
  });

  it('rechaza si analysisData es null (pliego sin analizar)', () => {
    const sinAnalisis = { ...validPresentationRequest, analysisData: null };
    expect(presentationRequestSchema.safeParse(sinAnalisis).success).toBe(false);
  });

  it('rechaza si falta analysisData', () => {
    const { analysisData, ...sinAnalisis } = validPresentationRequest;
    expect(presentationRequestSchema.safeParse(sinAnalisis).success).toBe(false);
  });

  it('rechaza si analysisData tiene un shape inválido', () => {
    const malo = { ...validPresentationRequest, analysisData: { lotes: [{ numero: 1 }] } };
    expect(presentationRequestSchema.safeParse(malo).success).toBe(false);
  });

  it('rechaza si falta expediente o título', () => {
    const { expediente, ...sinExp } = validPresentationRequest;
    expect(presentationRequestSchema.safeParse(sinExp).success).toBe(false);
    expect(presentationRequestSchema.safeParse({ ...validPresentationRequest, titulo: '' }).success).toBe(false);
  });

  it('acepta importe/lotes nulos y fechaLimite ausente', () => {
    const { fechaLimite, ...sinFecha } = validPresentationRequest;
    const flexible = { ...sinFecha, importe: null, lotes: null };
    expect(presentationRequestSchema.safeParse(flexible).success).toBe(true);
  });
});
