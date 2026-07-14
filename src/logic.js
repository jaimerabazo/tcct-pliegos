// ---------- HELPERS (formato, texto) ----------

export const isBlankNumber = (v) => v === '' || v === null || v === undefined || Number.isNaN(v);

// Los campos numéricos vacíos viajan como '' desde NumberField (ver fields.jsx).
// El contrato de la API espera número o null (nunca ''), así que normalizamos el
// hueco a null antes de persistir — así "sin valor" se guarda de verdad en vez de
// ser rechazado por la validación Zod (pérdida silenciosa del cambio).
export const blankNumberToNull = (v) => (isBlankNumber(v) ? null : v);

// Normaliza a null los campos numéricos editables de un analysisData (los que se
// editan con NumberField y por tanto pueden quedar en ''). No toca el resto del
// shape. Devuelve una copia; no muta la entrada.
export function normalizeAnalysisNumbers(data) {
  const d = structuredClone(data);
  (d.lotes || []).forEach((l) => { l.importe = blankNumberToNull(l.importe); });
  (d.perfiles || []).forEach((p) => {
    p.headcount = blankNumberToNull(p.headcount);
    p.experiencia = blankNumberToNull(p.experiencia);
  });
  if (d.solvencia?.tecnica) {
    d.solvencia.tecnica.volumenNegocio = blankNumberToNull(d.solvencia.tecnica.volumenNegocio);
  }
  if (d.solvencia?.economica) {
    d.solvencia.economica.seguroRC = blankNumberToNull(d.solvencia.economica.seguroRC);
    d.solvencia.economica.capitalMinimo = blankNumberToNull(d.solvencia.economica.capitalMinimo);
  }
  (d.criterios || []).forEach((c) => { c.peso = blankNumberToNull(c.peso); });
  return d;
}

export const formatNumber = (n) => (isBlankNumber(n) ? '—' : n);

export const formatEuro = (n) => {
  if (isBlankNumber(n)) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M €`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K €`;
  return `${n} €`;
};

export const formatEuroFull = (n) => (isBlankNumber(n) ? '—' : new Intl.NumberFormat('es-ES', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0
}).format(n));

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const formatShortDate = (d) => `${String(d.getDate()).padStart(2, '0')} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;

export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export const listToText = (arr) => (arr || []).join(', ');
export const textToList = (str) => str.split(',').map(s => s.trim()).filter(Boolean);
export const linesToText = (arr) => (arr || []).join('\n');
export const textToLines = (str) => str.split('\n').map(s => s.trim()).filter(Boolean);

// ---------- KPIs del dashboard ----------

export function computeDashboardKpis(pliegos) {
  const count = pliegos.length;
  const totalImporte = pliegos.reduce((sum, p) => sum + (Number(p.importe) || 0), 0);
  const avgImporte = count > 0 ? totalImporte / count : 0;

  const withAnalysis = pliegos.filter(p => p.analysisData);
  let avgConfianza = 94; // valor demo por defecto, antes de que haya ninguna analítica real
  if (withAnalysis.length > 0) {
    const confidences = [];
    withAnalysis.forEach(p => {
      (p.analysisData.lotes || []).forEach(l => { if (!isBlankNumber(l.confianza)) confidences.push(Number(l.confianza)); });
      (p.analysisData.perfiles || []).forEach(perfil => { if (!isBlankNumber(perfil.confianza)) confidences.push(Number(perfil.confianza)); });
    });
    if (confidences.length > 0) {
      avgConfianza = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    }
  }

  return { count, totalImporte, avgImporte, avgConfianza };
}

// ---------- Selección de pliego en vista Análisis ----------

export function pickDefaultPliegoId(pliegos) {
  const withAnalysis = pliegos.find(p => p.analysisData);
  return withAnalysis?.id ?? pliegos[0]?.id ?? null;
}

export function resolveSelectedPliegoId(pliegos, prevId) {
  if (prevId && pliegos.some(p => p.id === prevId)) return prevId;
  return pickDefaultPliegoId(pliegos);
}

// ---------- Validación lotes ↔ importe total ----------

export function getLotesSumMismatch(pliego, analysisData) {
  const lotes = analysisData?.lotes || [];
  const lotesSum = lotes.reduce((sum, l) => sum + (Number(l.importe) || 0), 0);
  const pliegoImporte = Number(pliego?.importe) || 0;
  if (lotesSum === pliegoImporte) return null;
  return { lotesSum, pliegoImporte, diff: lotesSum - pliegoImporte };
}
