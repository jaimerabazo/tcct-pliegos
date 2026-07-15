import { describe, it, expect } from 'vitest';
import { buildSlideSpecs, presentationFilename, SECTION_ORDER } from './presentationBuilder.js';
import { MOCK_PLIEGOS, MOCK_ANALYSIS } from '../../prisma/seed.js';

const pliego = MOCK_PLIEGOS.find((p) => p.id === '2026-7008');
const analysisData = MOCK_ANALYSIS['2026-7008'];

const resumenFinal = {
  titulares: ['Contrato marco de soporte a la Seguridad Social', '18,5 M€ en 3 lotes'],
  puntosFuertes: ['Experiencia previa en GISS', 'Certificaciones ENS Alto en regla'],
  riesgos: ['Volumen de negocio exigido alto (20 M€)'],
  recomendacion: 'Presentar oferta a los 3 lotes con equipo mixto.',
};

const build = (overrides = {}) =>
  buildSlideSpecs({ pliego, analysisData, tagline: 'Oferta técnica TCCT', resumenFinal, ...overrides });

describe('buildSlideSpecs — estructura general', () => {
  it('genera portada + 7 secciones + resumen final (9 diapositivas)', () => {
    const specs = build();
    expect(specs).toHaveLength(9);
    expect(specs[0].kind).toBe('cover');
    expect(specs.at(-1).kind).toBe('final');
    expect(specs.slice(1, 8).every((s) => s.kind === 'section')).toBe(true);
  });

  it('las 7 secciones centrales siguen el orden del índice de Analysis.jsx', () => {
    const specs = build();
    const titles = specs.slice(1, 8).map((s) => s.title);
    expect(titles).toEqual([
      'Resumen ejecutivo', 'Lotes', 'Perfiles requeridos', 'Solvencia',
      'Criterios de adjudicación', 'Penalizaciones', 'Plazos e hitos',
    ]);
    expect(SECTION_ORDER).toHaveLength(7);
  });

  it('numera cada sección (index/total) para el pie de diapositiva', () => {
    const specs = build();
    expect(specs[1]).toMatchObject({ index: 1, total: 7 });
    expect(specs[7]).toMatchObject({ index: 7, total: 7 });
  });

  it('lanza si falta el pliego o analysisData', () => {
    expect(() => buildSlideSpecs({ analysisData })).toThrow(/pliego/);
    expect(() => buildSlideSpecs({ pliego })).toThrow(/analysisData/);
  });
});

describe('buildSlideSpecs — portada', () => {
  it('incluye título, organismo, tagline y metadatos clave', () => {
    const cover = build()[0];
    expect(cover.title).toBe('Soporte Técnico de Sistemas');
    expect(cover.organismo).toBe('GISS · Seguridad Social');
    expect(cover.tagline).toBe('Oferta técnica TCCT');
    const labels = cover.meta.map((m) => m.label);
    expect(labels).toContain('Expediente');
    expect(labels).toContain('Importe');
    expect(labels).toContain('Cierre de ofertas');
    const importe = cover.meta.find((m) => m.label === 'Importe');
    expect(importe.value).toMatch(/18\.500\.000/);
    expect(importe.mono).toBe(true);
  });

  it('procedimiento y ENS en portada coinciden con Resumen ejecutivo (analysisData, no cabecera del pliego)', () => {
    const specs = build();
    const cover = specs[0];
    const resumenRows = specs[1].blocks[0].rows;
    const procedimientoCover = cover.meta.find((m) => m.label === 'Procedimiento');
    const ensCover = cover.meta.find((m) => m.label === 'ENS');
    const procedimientoResumen = resumenRows.find((r) => r.label === 'Procedimiento');
    const ensResumen = resumenRows.find((r) => r.label === 'Marco ENS');
    expect(procedimientoCover.value).toBe(procedimientoResumen.value);
    expect(ensCover.value).toBe(ensResumen.value);
    expect(procedimientoCover.value).toBe('Abierto sujeto a regulación armonizada (SARA)');
    expect(ensCover.value).toBe('Nivel Alto');
    expect(procedimientoCover.value).not.toBe(pliego.procedimiento);
    expect(ensCover.value).not.toBe(pliego.ens);
  });

  it('tagline vacío si no se proporciona', () => {
    const cover = build({ tagline: '' })[0];
    expect(cover.tagline).toBe('');
  });

  it('usa plazos.limite del análisis (misma fuente que Analysis y diapositiva Plazos)', () => {
    const cover = build()[0];
    const plazos = build()[7];
    const cierre = cover.meta.find((m) => m.label === 'Cierre de ofertas');
    const limitePlazos = plazos.blocks[0].rows.find((r) => r.label === 'Límite de presentación');
    expect(cierre.value).toBe('15 de julio de 2026, 14:00');
    expect(cierre.value).toBe(limitePlazos.value);
  });

  it('prefiere plazos.limite editado sobre pliego.fechaLimite obsoleto', () => {
    const edited = {
      ...analysisData,
      plazos: { ...analysisData.plazos, limite: '20 de agosto de 2026, 12:00' },
    };
    const stalePliego = { ...pliego, fechaLimite: '15 jul 2026' };
    const cierre = build({ pliego: stalePliego, analysisData: edited })[0].meta
      .find((m) => m.label === 'Cierre de ofertas');
    expect(cierre.value).toBe('20 de agosto de 2026, 12:00');
  });

  it('muestra "—" si plazos.limite está vacío, igual que el ribbon y la diapositiva Plazos (no cae a pliego.fechaLimite)', () => {
    const noPlazos = { ...analysisData, plazos: {} };
    // Aunque el pliego tenga una fechaLimite en cabecera, la portada NO debe mostrarla:
    // sería incoherente con el ribbon de Analysis y la diapositiva Plazos, que enseñan "—".
    const pliegoConFecha = { ...pliego, fechaLimite: '15 jul 2026' };
    const specs = build({ pliego: pliegoConFecha, analysisData: noPlazos });
    const cierre = specs[0].meta.find((m) => m.label === 'Cierre de ofertas');
    const limitePlazos = specs[7].blocks[0].rows.find((r) => r.label === 'Límite de presentación');
    expect(cierre.value).toBe('—');
    expect(cierre.value).toBe(limitePlazos.value);
  });
});

describe('buildSlideSpecs — secciones con tabla', () => {
  it('Lotes: una fila por lote con importe formateado y confianza en %', () => {
    const lotes = build()[2];
    const table = lotes.blocks[0];
    expect(table.type).toBe('table');
    expect(table.columns).toEqual(['Nº', 'Descripción', 'CPV', 'Importe', 'Confianza']);
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0][3]).toMatch(/6\.200\.000/);
    expect(table.rows[0][4]).toBe('98%');
  });

  it('Perfiles: mapea headcount, experiencia y certificaciones', () => {
    const perfiles = build()[3];
    const table = perfiles.blocks[0];
    expect(table.rows).toHaveLength(5);
    expect(table.rows[0]).toEqual(['TSSX', 'Técnico Superior Sistemas Expert', '4', '8', 'ITIL Expert, CCNP, RHCE', 'Todos']);
    // perfil sin certs → guion
    expect(table.rows[4][4]).toBe('—');
  });

  it('Criterios: traduce el tipo a etiqueta legible y peso en %', () => {
    const criterios = build()[5];
    const rows = criterios.blocks[0].rows;
    expect(rows[0]).toEqual(['Precio', 'Automático', '40%']);
    expect(rows[1][1]).toBe('Juicio de valor');
  });

  it('Penalizaciones: tipo, descripción y cuantía', () => {
    const pen = build()[6];
    const table = pen.blocks[0];
    expect(table.columns).toEqual(['Tipo', 'Descripción', 'Cuantía']);
    expect(table.rows).toHaveLength(3);
  });
});

describe('buildSlideSpecs — secciones keyvalue/bullets', () => {
  it('Resumen: incluye objeto, procedimiento y datos de marco (ENS/CCN-STIC/normativa)', () => {
    const resumen = build()[1];
    const rows = resumen.blocks[0].rows;
    const labels = rows.map((r) => r.label);
    expect(labels).toEqual(['Objeto', 'Procedimiento', 'Duración', 'Prórrogas', 'CPV', 'Marco ENS', 'CCN-STIC', 'Normativa']);
    expect(rows.find((r) => r.label === 'CPV').value).toContain('72222300-0');
    expect(rows.find((r) => r.label === 'Normativa').value).toContain('RGPD');
  });

  it('Solvencia: dos bloques (técnica y económica) con importes formateados', () => {
    const solv = build()[4];
    expect(solv.blocks).toHaveLength(2);
    expect(solv.blocks[0].heading).toBe('Solvencia técnica');
    expect(solv.blocks[1].heading).toBe('Solvencia económica');
    const volumen = solv.blocks[0].rows.find((r) => r.label === 'Volumen de negocio');
    expect(volumen.value).toMatch(/20\.000\.000/);
  });

  it('Plazos: keyvalue de fechas + bullets de hitos', () => {
    const plazos = build()[7];
    expect(plazos.blocks[0].type).toBe('keyvalue');
    expect(plazos.blocks[1].type).toBe('bullets');
    expect(plazos.blocks[1].items).toHaveLength(4);
  });
});

describe('buildSlideSpecs — resumen final', () => {
  it('mapea titulares, puntos fuertes, riesgos y recomendación', () => {
    const final = build().at(-1);
    expect(final.title).toBe('Conclusiones y recomendación');
    const headings = final.blocks.filter((b) => b.heading).map((b) => b.heading);
    expect(headings).toContain('Claves del expediente');
    expect(headings).toContain('Puntos fuertes para TCCT');
    expect(headings).toContain('Riesgos y puntos de atención');
    expect(headings).toContain('Recomendación');
    expect(final.blocks.at(-1).type).toBe('paragraph');
  });

  it('omite bloques vacíos y tolera resumenFinal nulo', () => {
    const final = buildSlideSpecs({ pliego, analysisData, resumenFinal: null }).at(-1);
    expect(final.kind).toBe('final');
    expect(final.blocks).toEqual([]);
  });

  it('omite solo los bloques ausentes, mantiene los presentes', () => {
    const final = buildSlideSpecs({
      pliego, analysisData,
      resumenFinal: { titulares: ['solo esto'], puntosFuertes: [], riesgos: [], recomendacion: '' },
    }).at(-1);
    expect(final.blocks).toHaveLength(1);
    expect(final.blocks[0].items).toEqual(['solo esto']);
  });
});

describe('buildSlideSpecs — datos parciales/vacíos (robustez)', () => {
  // Claude, o una edición manual agresiva, podrían dejar secciones ausentes o vacías.
  // El builder no debe reventar: rellena con "—", omite bloques de tabla sin filas, nunca lanza.
  const sparsePliego = { expediente: '2026/0001', titulo: 'Mínimo', organismo: '', importe: null, lotes: null, procedimiento: '', ens: '', fechaLimite: null };
  const sparseAnalysis = {}; // sin ninguna sección

  it('no lanza con analysisData sin secciones y produce 9 diapositivas', () => {
    const specs = buildSlideSpecs({ pliego: sparsePliego, analysisData: sparseAnalysis });
    expect(specs).toHaveLength(9);
  });

  it('omite bloques de tabla cuando no hay lotes/perfiles/criterios/penalizaciones', () => {
    const specs = buildSlideSpecs({ pliego: sparsePliego, analysisData: sparseAnalysis });
    expect(specs[2].blocks).toEqual([]); // lotes
    expect(specs[3].blocks).toEqual([]); // perfiles
    expect(specs[5].blocks).toEqual([]); // criterios
    expect(specs[6].blocks).toEqual([]); // penalizaciones
  });

  it('keyvalue con guiones cuando faltan resumen/marco/solvencia/plazos', () => {
    const specs = buildSlideSpecs({ pliego: sparsePliego, analysisData: sparseAnalysis });
    expect(specs[1].blocks[0].rows.every((r) => r.value === '—')).toBe(true); // resumen
    expect(specs[7].blocks[1].items).toEqual(['—']); // plazos → hitos vacíos
  });

  it('portada tolera importe/lotes nulos y campos vacíos', () => {
    const cover = buildSlideSpecs({ pliego: sparsePliego, analysisData: sparseAnalysis })[0];
    expect(cover.meta.find((m) => m.label === 'Importe').value).toBe('—');
    expect(cover.meta.find((m) => m.label === 'Lotes').value).toBe('—');
    expect(cover.organismo).toBe('—');
  });

  it('orDash colapsa arrays vacíos a guion', () => {
    const specs = buildSlideSpecs({
      pliego: sparsePliego,
      analysisData: { resumen: { cpv: [] }, marco: { ccnStic: [], normativa: [] } },
    });
    const cpv = specs[1].blocks[0].rows.find((r) => r.label === 'CPV');
    expect(cpv.value).toBe('—');
  });
});

describe('presentationFilename', () => {
  it('sanea la barra del expediente', () => {
    expect(presentationFilename(pliego)).toBe('Presentacion_2026-7008.pptx');
  });

  it('cae a un nombre por defecto si no hay expediente', () => {
    expect(presentationFilename(null)).toBe('Presentacion_pliego.pptx');
    expect(presentationFilename({})).toBe('Presentacion_pliego.pptx');
  });
});
