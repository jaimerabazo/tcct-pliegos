import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './_lib/prisma.js';
import { pliegoFromAnalysisSchema, analysisDataSchema } from './_lib/schemas.js';
import { requireMember } from './_lib/authz.js';
import { withTenant } from './_lib/tenantDb.js';
import { recordUsageBestEffort } from './_lib/usage.js';
import { parseShortDate } from '../src/logic.js';

export const config = {
  maxDuration: 300,
};

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const EXTRACTION_PROMPT = `Eres un asistente experto en contratación pública española (PPT + PCAP) para el equipo de presales de ciberseguridad de Telefónica Cybersecurity & Cloud Tech (TCCT).

Se te adjunta el PDF de un expediente de licitación pública. Extrae los datos estructurados del pliego y devuélvelos en el JSON solicitado.

Instrucciones de formato:
- Fechas cortas (pliego.fechaLimite): "DD mes AAAA" en minúsculas, ej. "15 jul 2026".
- Fechas largas (analysis.plazos.*): "DD de mes de AAAA[, HH:MM]", ej. "15 de julio de 2026, 14:00".
- Importes (importe, seguroRC, capitalMinimo, volumenNegocio): número en euros sin símbolo ni separadores de miles.
- "confianza" en lotes/perfiles: entero 0-100 que refleje cuánto confías en que ese dato concreto está bien extraído del documento (baja si el campo es ambiguo, incompleto o inferido).
- Si un dato no aparece en el documento, usa "No especificado" (strings) o el valor por defecto más razonable (0 para números, [] para listas), nunca inventes cifras.
- "ens" (nivel de Esquema Nacional de Seguridad): "Alto", "Medio", "Bajo" o "No aplica" si el pliego no lo menciona.
- "criterios[].tipo": "automatico" para criterios evaluables por fórmula (precio, mejoras cuantificables), "juicio" para criterios de juicio de valor.`;

const PLIEGO_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pliego: {
      type: 'object',
      additionalProperties: false,
      properties: {
        expediente: { type: 'string', description: 'Número de expediente, ej. 2026/7008' },
        titulo: { type: 'string' },
        organismo: { type: 'string' },
        importe: { type: 'number' },
        lotes: { type: 'integer', description: 'Número total de lotes' },
        fechaLimite: { type: 'string', description: 'Formato corto: "15 jul 2026"' },
        procedimiento: { type: 'string' },
        ens: { type: 'string' },
      },
      required: ['expediente', 'titulo', 'organismo', 'importe', 'lotes', 'fechaLimite', 'procedimiento', 'ens'],
    },
    analysis: {
      type: 'object',
      additionalProperties: false,
      properties: {
        resumen: {
          type: 'object',
          additionalProperties: false,
          properties: {
            objeto: { type: 'string' },
            cpv: { type: 'array', items: { type: 'string' } },
            procedimiento: { type: 'string' },
            duracion: { type: 'string' },
            prorrogas: { type: 'string' },
          },
          required: ['objeto', 'cpv', 'procedimiento', 'duracion', 'prorrogas'],
        },
        lotes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              numero: { type: 'integer' },
              descripcion: { type: 'string' },
              importe: { type: 'number' },
              cpv: { type: 'string' },
              confianza: { type: 'integer' },
            },
            required: ['numero', 'descripcion', 'importe', 'cpv', 'confianza'],
          },
        },
        perfiles: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              codigo: { type: 'string' },
              categoria: { type: 'string' },
              headcount: { type: 'integer' },
              experiencia: { type: 'integer', description: 'Años de experiencia mínima requerida' },
              certs: { type: 'array', items: { type: 'string' } },
              lote: { type: 'string', description: 'Lote(s) al que aplica, ej. "Todos" o "L1, L2"' },
              confianza: { type: 'integer' },
            },
            required: ['codigo', 'categoria', 'headcount', 'experiencia', 'certs', 'lote', 'confianza'],
          },
        },
        solvencia: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tecnica: {
              type: 'object',
              additionalProperties: false,
              properties: {
                experienciaMinima: { type: 'string' },
                volumenNegocio: { type: 'number' },
                clasificacion: { type: 'string' },
                certificaciones: { type: 'array', items: { type: 'string' } },
              },
              required: ['experienciaMinima', 'volumenNegocio', 'clasificacion', 'certificaciones'],
            },
            economica: {
              type: 'object',
              additionalProperties: false,
              properties: {
                seguroRC: { type: 'number' },
                capitalMinimo: { type: 'number' },
              },
              required: ['seguroRC', 'capitalMinimo'],
            },
          },
          required: ['tecnica', 'economica'],
        },
        criterios: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tipo: { type: 'string', enum: ['automatico', 'juicio'] },
              criterio: { type: 'string' },
              peso: { type: 'number' },
            },
            required: ['tipo', 'criterio', 'peso'],
          },
        },
        penalizaciones: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tipo: { type: 'string' },
              descripcion: { type: 'string' },
              importe: { type: 'string', description: 'Descripción de la penalización, ej. "10% de la facturación mensual"' },
            },
            required: ['tipo', 'descripcion', 'importe'],
          },
        },
        plazos: {
          type: 'object',
          additionalProperties: false,
          properties: {
            limite: { type: 'string' },
            apertura: { type: 'string' },
            formalizacion: { type: 'string' },
            inicio: { type: 'string' },
            hitos: { type: 'array', items: { type: 'string' } },
          },
          required: ['limite', 'apertura', 'formalizacion', 'inicio', 'hitos'],
        },
        marco: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ens: { type: 'string' },
            ccnStic: { type: 'array', items: { type: 'string' } },
            normativa: { type: 'array', items: { type: 'string' } },
          },
          required: ['ens', 'ccnStic', 'normativa'],
        },
      },
      required: ['resumen', 'lotes', 'perfiles', 'solvencia', 'criterios', 'penalizaciones', 'plazos', 'marco'],
    },
  },
  required: ['pliego', 'analysis'],
};

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function getAnthropicResult(message) {
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Claude ha leído el PDF, pero la respuesta JSON se ha cortado por límite de tokens de salida.');
  }

  const textBlock = message.content?.find((block) => block.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Anthropic no ha devuelto un bloque de texto con el JSON estructurado.');
  }

  try {
    return JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error('Claude ha respondido, pero no se ha podido convertir la respuesta en JSON válido.');
  }
}

function getClientErrorMessage(err) {
  if (err?.status === 401) {
    return 'La API key de Anthropic no es válida o ha sido revocada.';
  }

  if (err?.status === 403) {
    return 'La API key de Anthropic no tiene permisos para usar este modelo o recurso.';
  }

  if (err?.status === 429) {
    return 'Anthropic ha limitado la petición por cuota o rate limit. Revisa billing/cuota o inténtalo de nuevo en unos minutos.';
  }

  if (err?.status === 400 && err?.message?.includes('credit')) {
    return 'La cuenta de Anthropic no tiene créditos disponibles o billing configurado.';
  }

  if (err?.status === 413) {
    return 'El PDF es demasiado grande para enviarlo a Claude en una sola petición.';
  }

  if (err?.message?.includes('límite de tokens')) {
    return 'Claude ha leído el PDF, pero la respuesta se ha cortado por límite de tokens. Prueba con un PDF más pequeño o subimos el límite/partimos el análisis.';
  }

  if (err?.message?.includes('JSON válido')) {
    return 'Claude ha leído el PDF, pero la respuesta no encaja todavía con el JSON esperado por la aplicación.';
  }

  return 'No se ha podido analizar el documento. Inténtalo de nuevo.';
}

// Convierte el resultado ya validado de Claude en la fila que espera Prisma.
// Testable sin BD real: es una función pura (ver api/analyze.test.js).
export function toPliegoRowFromAnalysis({ pliego, analysis }) {
  const now = new Date();
  return {
    expediente: pliego.expediente,
    titulo: pliego.titulo,
    organismo: pliego.organismo,
    importe: pliego.importe,
    lotes: pliego.lotes,
    estado: 'analizado',
    procedimiento: pliego.procedimiento,
    ens: pliego.ens,
    fechaAnalisis: now,
    fechaLimite: parseShortDate(pliego.fechaLimite),
    analysisData: analysis,
  };
}

// Persiste (o refresca, si esta org ya analizó el mismo expediente) el resultado.
// Recibe el cliente Prisma por parámetro — mismo patrón de inyección que prisma/seed.js.
//
// Bloque 3: la clave natural es (organizationId, expediente) — dos orgs pueden analizar
// el mismo pliego público sin pisarse. El upsert compuesto también evita la carrera de
// dos análisis simultáneos del mismo expediente dentro de una org.
export async function persistAnalysis(client, result, { organizationId, userId }) {
  const row = toPliegoRowFromAnalysis(result);
  return client.pliego.upsert({
    where: {
      organizationId_expediente: { organizationId, expediente: row.expediente },
    },
    update: { ...row, updatedBy: userId },
    create: { ...row, organizationId, createdBy: userId },
  });
}

// `client` es inyectable para tests; Vercel llama con dos argumentos → singleton real.
export default async function handler(req, res, client = prisma) {
  // Guard de auth Y org ANTES de leer el body: sin sesión válida ni membership no se
  // gasta ni un byte (ni una llamada a Claude — este endpoint es el más caro de la app).
  const ctx = await requireMember(req, res, { client });
  if (!ctx) return; // requireMember ya ha respondido 400/401/403/500

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en el entorno del servidor.' });
    return;
  }

  // Comprobamos la config de BD antes de extraer el PDF: la persistencia con Prisma
  // ocurre después de llamar a Claude, así que sin este guard un DATABASE_URL ausente
  // gastaría una extracción completa para acabar fallando con un 502 genérico.
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: 'Falta configurar DATABASE_URL en el entorno del servidor.' });
    return;
  }

  const pdfBuffer = await readRequestBody(req);
  if (!pdfBuffer.length) {
    res.status(400).json({ error: 'No se ha recibido ningún archivo.' });
    return;
  }

  const filename = decodeURIComponent(req.headers['x-filename'] || 'pliego.pdf');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 20000,
      system: EXTRACTION_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBuffer.toString('base64'),
              },
              title: filename,
            },
            { type: 'text', text: 'Extrae los datos estructurados de este pliego de licitación pública.' },
          ],
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: PLIEGO_ANALYSIS_SCHEMA,
        },
      },
    });

    const result = getAnthropicResult(response);

    const pliegoCheck = pliegoFromAnalysisSchema.safeParse(result.pliego);
    const analysisCheck = analysisDataSchema.safeParse(result.analysis);
    if (!pliegoCheck.success || !analysisCheck.success) {
      console.error('Respuesta de Claude no válida:', pliegoCheck.error ?? analysisCheck.error);
      res.status(502).json({ error: 'Claude ha devuelto un JSON válido, pero no coincide con los campos esperados.' });
      return;
    }

    // La escritura principal se confirma antes de intentar el metering. Si usage_events
    // falla, su transacción separada no puede deshacer un análisis ya guardado.
    const saved = await withTenant(client, ctx.orgId, (db) =>
      persistAnalysis(db, { pliego: pliegoCheck.data, analysis: analysisCheck.data }, {
        organizationId: ctx.orgId,
        userId: ctx.user.id,
      }));

    // Best effort: abre y cierra su propia transacción; cualquier fallo se trata después
    // del rollback y no cambia la respuesta al usuario.
    await recordUsageBestEffort(client, ctx.orgId, {
      organizationId: ctx.orgId,
      userId: ctx.user.id,
      type: 'analyze',
      model: MODEL,
      usage: response.usage,
      pliegoId: saved.id,
    });
    // El frontend (UploadModal → handleUploadComplete) espera { pliego, analysis }, no la fila
    // plana de Prisma. Devolvemos los datos ya validados (pliego con fechaLimite en formato corto,
    // como consume la UI) y adjuntamos el id real de la BD.
    res.status(200).json({
      pliego: { ...pliegoCheck.data, id: saved.id },
      analysis: analysisCheck.data,
    });
  } catch (err) {
    console.error('Error analizando el pliego:', err);
    res.status(502).json({ error: getClientErrorMessage(err) });
  }
}
