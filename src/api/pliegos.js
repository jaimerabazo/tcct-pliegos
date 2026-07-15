// Cliente HTTP de la API de pliegos. Centraliza las llamadas fetch, el manejo de
// errores (lanza Error con el mensaje del servidor) y la normalización del shape
// de la BD al que consume la UI: las filas de Postgres traen las fechas como ISO,
// pero los componentes las muestran en formato corto ("15 jul 2026").
import { formatShortDate } from '../logic.js';

async function jsonOrThrow(res, fallbackMsg) {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `${fallbackMsg} (HTTP ${res.status}).`);
  }
  return res.json();
}

function toShortDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : formatShortDate(d);
}

// Convierte una fila plana de la BD en el pliego que espera la UI.
export function normalizePliego(row) {
  return {
    ...row,
    fechaAnalisis: toShortDate(row.fechaAnalisis) ?? row.fechaAnalisis,
    fechaLimite: toShortDate(row.fechaLimite),
  };
}

export async function listPliegos() {
  const res = await fetch('/api/pliegos');
  const rows = await jsonOrThrow(res, 'No se han podido cargar los pliegos');
  return rows.map(normalizePliego);
}

// Sube el PDF a /api/analyze. Devuelve { pliego, analysis } tal cual (el pliego ya
// trae fechaLimite en formato corto desde Claude); la fila persistida completa llega
// luego al invalidar la lista.
export async function analyzePdf(file) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-Filename': encodeURIComponent(file.name),
    },
    body: file,
  });
  return jsonOrThrow(res, 'No se ha podido analizar el documento');
}

export async function updatePliego(id, patch) {
  const res = await fetch(`/api/pliegos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return normalizePliego(await jsonOrThrow(res, 'No se ha podido actualizar el pliego'));
}

export async function updateAnalysis(id, analysisData) {
  const res = await fetch(`/api/pliegos/${id}/analysis`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(analysisData),
  });
  return normalizePliego(await jsonOrThrow(res, 'No se ha podido actualizar el análisis'));
}

// Extrae el nombre de archivo de la cabecera Content-Disposition del servidor.
function filenameFromDisposition(header) {
  if (!header) return null;
  const match = /filename="?([^"]+)"?/.exec(header);
  return match ? match[1] : null;
}

// Genera la presentación PowerPoint del pliego. A diferencia del resto de endpoints,
// la respuesta es un binario (.pptx), no JSON: en éxito devuelve { blob, filename } para
// que el llamante dispare la descarga; en error el servidor sí responde JSON con { error }.
// Manda el pliego cacheado (cabecera + analysisData) en el body — el endpoint no relee la BD.
export async function generatePresentation(pliego) {
  const res = await fetch(`/api/pliegos/${pliego.id}/presentation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pliego),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `El servidor ha respondido con un error (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const expedienteSafe = (pliego.expediente || 'pliego').replace(/[^\w.-]+/g, '-');
  const filename = filenameFromDisposition(res.headers.get('Content-Disposition')) || `Presentacion_${expedienteSafe}.pptx`;
  return { blob, filename };
}

// Dispara la descarga de un Blob en el navegador (crea un <a download> temporal).
// El revoke se difiere: en algunos navegadores (Safari/WebKit) revocar la object URL
// de forma síncrona tras click() aborta la descarga antes de que empiece a leerla.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 0);
}
