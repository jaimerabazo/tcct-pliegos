// Construcción de la presentación PowerPoint de un pliego analizado.
//
// Dos responsabilidades separadas a propósito:
//   1. `buildSlideSpecs(...)` — PURA: transforma pliego + analysisData + resumen final
//      (de Claude) en un array de "specs" de diapositiva render-agnósticas (bloques
//      keyvalue/table/bullets/paragraph). Sin dependencia de pptxgenjs → testeable.
//   2. `renderPptx(specs)` — IO: materializa esas specs en un Buffer .pptx con pptxgenjs.
//      No lleva test unitario (plumbing), mismo criterio que el handler de api/analyze.js.
//
// El contenido de las 7 diapositivas centrales se formatea directamente desde
// `analysisData` (datos ya validados/editados por el usuario, confianza incluida). NO se
// pasa por Claude para no alterar cifras verificadas. Claude solo aporta el resumen final.
import { formatEuroFull, formatNumber } from '../../src/logic.js';
import { PPT, FONT, LAYOUT } from './presentationTheme.js';

// Orden de las secciones centrales — DEBE coincidir con `SECTIONS` de src/views/Analysis.jsx
// (el índice que el usuario ve en la vista de análisis).
const SECTION_ORDER = [
  'resumen', 'lotes', 'perfiles', 'solvencia', 'criterios', 'penalizaciones', 'plazos',
];

const SECTION_LABELS = {
  resumen: 'Resumen ejecutivo',
  lotes: 'Lotes',
  perfiles: 'Perfiles requeridos',
  solvencia: 'Solvencia',
  criterios: 'Criterios de adjudicación',
  penalizaciones: 'Penalizaciones',
  plazos: 'Plazos e hitos',
};

// Valor legible o guion si está vacío (strings/listas). Los números pasan por formatNumber.
const orDash = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
};

const pct = (n) => (n === null || n === undefined || n === '' ? '—' : `${n}%`);

// --- Builders por sección (cada uno devuelve { blocks } para su diapositiva) ---

function buildResumenBlocks(analysisData) {
  const r = analysisData.resumen ?? {};
  const m = analysisData.marco ?? {};
  return [
    {
      type: 'keyvalue',
      rows: [
        { label: 'Objeto', value: orDash(r.objeto) },
        { label: 'Procedimiento', value: orDash(r.procedimiento) },
        { label: 'Duración', value: orDash(r.duracion) },
        { label: 'Prórrogas', value: orDash(r.prorrogas) },
        { label: 'CPV', value: orDash(r.cpv), mono: true },
        { label: 'Marco ENS', value: orDash(m.ens) },
        { label: 'CCN-STIC', value: orDash(m.ccnStic) },
        { label: 'Normativa', value: orDash(m.normativa) },
      ],
    },
  ];
}

function buildLotesBlocks(analysisData) {
  const lotes = analysisData.lotes ?? [];
  return [
    {
      type: 'table',
      columns: ['Nº', 'Descripción', 'CPV', 'Importe', 'Confianza'],
      rows: lotes.map((l) => [
        orDash(l.numero),
        orDash(l.descripcion),
        orDash(l.cpv),
        formatEuroFull(l.importe),
        pct(l.confianza),
      ]),
    },
  ];
}

function buildPerfilesBlocks(analysisData) {
  const perfiles = analysisData.perfiles ?? [];
  return [
    {
      type: 'table',
      columns: ['Código', 'Categoría', 'Nº', 'Exp. (años)', 'Certificaciones', 'Lote'],
      rows: perfiles.map((p) => [
        orDash(p.codigo),
        orDash(p.categoria),
        String(formatNumber(p.headcount)),
        String(formatNumber(p.experiencia)),
        orDash(p.certs),
        orDash(p.lote),
      ]),
    },
  ];
}

function buildSolvenciaBlocks(analysisData) {
  const t = analysisData.solvencia?.tecnica ?? {};
  const e = analysisData.solvencia?.economica ?? {};
  return [
    {
      type: 'keyvalue',
      heading: 'Solvencia técnica',
      rows: [
        { label: 'Experiencia mínima', value: orDash(t.experienciaMinima) },
        { label: 'Volumen de negocio', value: formatEuroFull(t.volumenNegocio) },
        { label: 'Clasificación', value: orDash(t.clasificacion) },
        { label: 'Certificaciones', value: orDash(t.certificaciones) },
      ],
    },
    {
      type: 'keyvalue',
      heading: 'Solvencia económica',
      rows: [
        { label: 'Seguro RC', value: formatEuroFull(e.seguroRC) },
        { label: 'Capital mínimo', value: formatEuroFull(e.capitalMinimo) },
      ],
    },
  ];
}

function buildCriteriosBlocks(analysisData) {
  const criterios = analysisData.criterios ?? [];
  return [
    {
      type: 'table',
      columns: ['Criterio', 'Tipo', 'Peso'],
      rows: criterios.map((c) => [
        orDash(c.criterio),
        c.tipo === 'automatico' ? 'Automático' : c.tipo === 'juicio' ? 'Juicio de valor' : orDash(c.tipo),
        pct(c.peso),
      ]),
    },
  ];
}

function buildPenalizacionesBlocks(analysisData) {
  const pen = analysisData.penalizaciones ?? [];
  return [
    {
      type: 'table',
      columns: ['Tipo', 'Descripción', 'Cuantía'],
      rows: pen.map((p) => [
        orDash(p.tipo),
        orDash(p.descripcion),
        orDash(p.importe),
      ]),
    },
  ];
}

function buildPlazosBlocks(analysisData) {
  const p = analysisData.plazos ?? {};
  return [
    {
      type: 'keyvalue',
      rows: [
        { label: 'Límite de presentación', value: orDash(p.limite) },
        { label: 'Apertura de ofertas', value: orDash(p.apertura) },
        { label: 'Formalización', value: orDash(p.formalizacion) },
        { label: 'Inicio del contrato', value: orDash(p.inicio) },
      ],
    },
    {
      type: 'bullets',
      heading: 'Hitos del contrato',
      items: (p.hitos ?? []).length ? p.hitos : ['—'],
    },
  ];
}

const SECTION_BUILDERS = {
  resumen: buildResumenBlocks,
  lotes: buildLotesBlocks,
  perfiles: buildPerfilesBlocks,
  solvencia: buildSolvenciaBlocks,
  criterios: buildCriteriosBlocks,
  penalizaciones: buildPenalizacionesBlocks,
  plazos: buildPlazosBlocks,
};

// --- Diapositivas especiales (portada y resumen final) ---

function buildCoverSpec(pliego, tagline) {
  return {
    kind: 'cover',
    title: orDash(pliego.titulo),
    organismo: orDash(pliego.organismo),
    tagline: tagline ? String(tagline) : '',
    meta: [
      { label: 'Expediente', value: orDash(pliego.expediente), mono: true },
      { label: 'Importe', value: formatEuroFull(pliego.importe), mono: true },
      { label: 'Lotes', value: String(formatNumber(pliego.lotes)) },
      { label: 'Procedimiento', value: orDash(pliego.procedimiento) },
      { label: 'ENS', value: orDash(pliego.ens) },
      { label: 'Cierre de ofertas', value: orDash(pliego.fechaLimite) },
    ],
  };
}

function buildFinalSpec(resumenFinal) {
  const rf = resumenFinal ?? {};
  const blocks = [];
  if ((rf.titulares ?? []).length) {
    blocks.push({ type: 'bullets', heading: 'Claves del expediente', items: rf.titulares });
  }
  if ((rf.puntosFuertes ?? []).length) {
    blocks.push({ type: 'bullets', heading: 'Puntos fuertes para TCCT', items: rf.puntosFuertes });
  }
  if ((rf.riesgos ?? []).length) {
    blocks.push({ type: 'bullets', heading: 'Riesgos y puntos de atención', items: rf.riesgos });
  }
  if (rf.recomendacion) {
    blocks.push({ type: 'paragraph', heading: 'Recomendación', text: String(rf.recomendacion) });
  }
  return { kind: 'final', title: 'Conclusiones y recomendación', blocks };
}

// Punto de entrada PURO: pliego (cabecera) + analysisData (7 secciones) + tagline y
// resumenFinal (generados por Claude) → array ordenado de specs de diapositiva.
export function buildSlideSpecs({ pliego, analysisData, tagline = '', resumenFinal = null }) {
  if (!pliego) throw new Error('buildSlideSpecs: falta el pliego.');
  if (!analysisData) throw new Error('buildSlideSpecs: falta analysisData (el pliego no está analizado).');

  const specs = [buildCoverSpec(pliego, tagline)];

  SECTION_ORDER.forEach((sectionId, i) => {
    specs.push({
      kind: 'section',
      index: i + 1,
      total: SECTION_ORDER.length,
      title: SECTION_LABELS[sectionId],
      blocks: SECTION_BUILDERS[sectionId](analysisData),
    });
  });

  specs.push(buildFinalSpec(resumenFinal));
  return specs;
}

// Nombre de archivo de descarga seguro a partir del expediente (2026/7008 → 2026-7008).
export function presentationFilename(pliego) {
  const exp = (pliego?.expediente ?? 'pliego').replace(/[^\w.-]+/g, '-');
  return `Presentacion_${exp}.pptx`;
}

export { SECTION_ORDER, SECTION_LABELS };
