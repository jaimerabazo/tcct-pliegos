// Schemas de validación de los endpoints /api/pliegos/*.
// Mismo shape que PLIEGO_ANALYSIS_SCHEMA (api/analyze.js) usa para forzar la salida
// de Claude — se repite en Zod (no se puede compartir literalmente: uno es JSON
// Schema para Structured Outputs, el otro es Zod) para no validar con dos contratos
// distintos entre la extracción y la API.
import { z } from 'zod';

export const ESTADOS = ['analizado', 'procesando', 'revision', 'error'];

// (pliegoPatchSchema se define más abajo, tras analysisDataSchema, porque puede
// incluir analysisData en un mismo patch — ver la nota junto a su definición.)

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

// Los campos numéricos editables desde la UI (NumberField) admiten null: un hueco
// se guarda como "sin valor", no como '' (ver src/logic.js:normalizeAnalysisNumbers).
const loteSchema = z.object({
  numero: z.number().int(),
  descripcion: z.string(),
  importe: z.number().nullable(),
  cpv: z.string(),
  confianza: z.number(),
}).strict();

const perfilSchema = z.object({
  codigo: z.string(),
  categoria: z.string(),
  headcount: z.number().nullable(),
  experiencia: z.number().nullable(),
  certs: z.array(z.string()),
  lote: z.string(),
  confianza: z.number(),
}).strict();

const criterioSchema = z.object({
  tipo: z.enum(['automatico', 'juicio']),
  criterio: z.string(),
  peso: z.number().nullable(),
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
      volumenNegocio: z.number().nullable(),
      clasificacion: z.string(),
      certificaciones: z.array(z.string()),
    }).strict(),
    economica: z.object({
      seguroRC: z.number().nullable(),
      capitalMinimo: z.number().nullable(),
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

// Campos actualizables de un pliego. `id`, `expediente`, `createdAt` y `updatedAt`
// no se tocan aquí (expediente es la clave natural, el resto lo gestiona Prisma).
// `analysisData` sí se admite —además de tener su propio endpoint— para poder
// actualizar en un ÚNICO PATCH (una sola escritura de fila, por tanto atómica) tanto
// la cabecera como el análisis: al editar "Lotes" cambian a la vez el `importe` de
// cabecera y `analysisData.lotes`, y deben persistirse juntos o no persistirse (si
// fueran dos PATCH separados, uno podría fallar y dejar importe y lotes descuadrados).
export const pliegoPatchSchema = z.object({
  titulo: z.string().min(1).optional(),
  organismo: z.string().min(1).optional(),
  // Nullable: un campo numérico vacío en la UI se persiste como null ("sin valor"),
  // no como '' (que la validación rechazaría). Ver src/logic.js:blankNumberToNull.
  importe: z.number().nullable().optional(),
  lotes: z.number().int().optional(),
  estado: z.enum(ESTADOS).optional(),
  procedimiento: z.string().min(1).optional(),
  ens: z.string().min(1).optional(),
  fechaLimite: z.coerce.date().optional(),
  analysisData: analysisDataSchema.optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, {
  // Prisma rechaza un update con `data` vacío (500); exigir al menos un campo lo
  // convierte en un 400 claro en vez de un fallo genérico del servidor.
  message: 'Debe indicarse al menos un campo a actualizar.',
});

// --- Organizaciones e invitaciones (Bloque 3, fase 4) ---
export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
}).strict();

export const invitationCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['owner', 'member']).default('member'),
}).strict();

export const invitationAcceptSchema = z.object({
  token: z.string().trim().min(32).max(256),
}).strict();

// --- Exportación a PowerPoint (api/pliegos/[id]/presentation.js) ---
//
// Fila scoped que el endpoint relee de la BD antes de generar. Se valida de forma
// defensiva: la cabecera de forma laxa (`.passthrough()` tolera id/estado/fechas/etc.)
// y `analysisData` de forma estricta. Si el pliego no está analizado, analysisData es
// null y la generación responde 400 (la UI también deshabilita el botón).
export const presentationRequestSchema = z.object({
  expediente: z.string().min(1),
  titulo: z.string().min(1),
  organismo: z.string(),
  importe: z.number().nullable().optional(),
  lotes: z.number().nullable().optional(),
  procedimiento: z.string().optional(),
  ens: z.string().optional(),
  fechaLimite: z.union([z.string(), z.null()]).optional(),
  analysisData: analysisDataSchema,
}).passthrough();

// Las 7 diapositivas centrales se formatean directamente desde analysisData (no se
// pasan por Claude). Claude SOLO genera el contenido "sintetizado" que no existe aún:
// el tagline de portada y el resumen final (conclusiones). Este schema valida esa
// respuesta — defensa en profundidad, igual que analysisDataSchema, aunque el
// json_schema de Structured Outputs ya debería garantizar el shape. Lo consume
// buildSlideSpecs (api/_lib/presentationBuilder.js) como { tagline, resumenFinal }.
export const presentationContentSchema = z.object({
  // Subtítulo breve para la portada (una frase). Puede venir vacío; el builder lo omite.
  tagline: z.string(),
  resumenFinal: z.object({
    // Ideas clave del expediente (2-4 bullets). Arrays vacíos → el builder omite el bloque.
    titulares: z.array(z.string()),
    // Por qué TCCT encaja bien en este pliego.
    puntosFuertes: z.array(z.string()),
    // Riesgos / puntos de atención para la oferta.
    riesgos: z.array(z.string()),
    // Recomendación de posicionamiento (párrafo). Puede venir vacía.
    recomendacion: z.string(),
  }).strict(),
}).strict();
