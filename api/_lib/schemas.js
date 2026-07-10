// Schemas de validación de los endpoints /api/pliegos/*.
// Mismo shape que PLIEGO_ANALYSIS_SCHEMA (api/analyze.js) usa para forzar la salida
// de Claude — se repite en Zod (no se puede compartir literalmente: uno es JSON
// Schema para Structured Outputs, el otro es Zod) para no validar con dos contratos
// distintos entre la extracción y la API.
import { z } from 'zod';

export const ESTADOS = ['analizado', 'procesando', 'revision', 'error'];

// Campos de cabecera del pliego que se pueden actualizar por separado de analysisData
// (sustituye a onUpdatePliego). `id`, `expediente`, `analysisData`, `createdAt`,
// `updatedAt` no se tocan aquí: expediente es la clave natural, analysisData tiene
// su propio endpoint, el resto lo gestiona Prisma.
export const pliegoPatchSchema = z.object({
  titulo: z.string().min(1).optional(),
  organismo: z.string().min(1).optional(),
  importe: z.number().optional(),
  lotes: z.number().int().optional(),
  estado: z.enum(ESTADOS).optional(),
  procedimiento: z.string().min(1).optional(),
  ens: z.string().min(1).optional(),
  fechaLimite: z.coerce.date().optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, {
  // Prisma rechaza un update con `data` vacío (500); exigir al menos un campo lo
  // convierte en un 400 claro en vez de un fallo genérico del servidor.
  message: 'Debe indicarse al menos un campo a actualizar.',
});

// Shape del bloque `pliego` tal como lo devuelve Claude (api/analyze.js), antes de
// persistirlo — `fechaLimite` todavía es el string corto ("15 jul 2026"), no un Date.
export const pliegoFromAnalysisSchema = z.object({
  expediente: z.string().min(1),
  titulo: z.string().min(1),
  organismo: z.string().min(1),
  importe: z.number(),
  lotes: z.number().int(),
  fechaLimite: z.string().min(1),
  procedimiento: z.string().min(1),
  ens: z.string().min(1),
}).strict();

const loteSchema = z.object({
  numero: z.number().int(),
  descripcion: z.string(),
  importe: z.number(),
  cpv: z.string(),
  confianza: z.number(),
}).strict();

const perfilSchema = z.object({
  codigo: z.string(),
  categoria: z.string(),
  headcount: z.number(),
  experiencia: z.number(),
  certs: z.array(z.string()),
  lote: z.string(),
  confianza: z.number(),
}).strict();

const criterioSchema = z.object({
  tipo: z.enum(['automatico', 'juicio']),
  criterio: z.string(),
  peso: z.number(),
}).strict();

const penalizacionSchema = z.object({
  tipo: z.string(),
  descripcion: z.string(),
  importe: z.string(),
}).strict();

// Shape completo de `analysisData` — una sección se sustituye en el cliente y se
// manda entera (mismo contrato que ya usa Analysis.jsx con onUpdateAnalysis).
export const analysisDataSchema = z.object({
  resumen: z.object({
    objeto: z.string(),
    cpv: z.array(z.string()),
    procedimiento: z.string(),
    duracion: z.string(),
    prorrogas: z.string(),
  }).strict(),
  lotes: z.array(loteSchema),
  perfiles: z.array(perfilSchema),
  solvencia: z.object({
    tecnica: z.object({
      experienciaMinima: z.string(),
      volumenNegocio: z.number(),
      clasificacion: z.string(),
      certificaciones: z.array(z.string()),
    }).strict(),
    economica: z.object({
      seguroRC: z.number(),
      capitalMinimo: z.number(),
    }).strict(),
  }).strict(),
  criterios: z.array(criterioSchema),
  penalizaciones: z.array(penalizacionSchema),
  plazos: z.object({
    limite: z.string(),
    apertura: z.string(),
    formalizacion: z.string(),
    inicio: z.string(),
    hitos: z.array(z.string()),
  }).strict(),
  marco: z.object({
    ens: z.string(),
    ccnStic: z.array(z.string()),
    normativa: z.array(z.string()),
  }).strict(),
}).strict();
