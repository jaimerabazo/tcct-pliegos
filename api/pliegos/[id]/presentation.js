import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../_lib/prisma.js';
import { presentationRequestSchema, presentationContentSchema } from '../../_lib/schemas.js';
import { buildSlideSpecs, presentationFilename } from '../../_lib/presentationBuilder.js';
import { renderPptx } from '../../_lib/presentationRenderer.js';
import { requireMember } from '../../_lib/authz.js';
import { withTenant } from '../../_lib/tenantDb.js';
import { recordUsage } from '../../_lib/usage.js';

// Generación más rápida que /api/analyze (no sube un PDF, solo sintetiza un resumen
// corto sobre datos ya estructurados). 60s sobra; ver también vercel.json.
export const config = {
  maxDuration: 60,
};

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const PRESENTATION_PROMPT = `Eres un consultor presales de Telefónica Cybersecurity & Cloud Tech (TCCT) preparando una presentación interna (Comité de Ofertas) sobre un pliego de licitación pública española ya analizado.

Recibes los datos estructurados del pliego (cabecera + análisis). NO tienes que reextraer nada: esos datos ya están validados y se muestran tal cual en la presentación. Tu único trabajo es redactar la SÍNTESIS que no existe todavía:

1. "tagline": subtítulo breve para la portada (una sola frase, máx. ~12 palabras), que capte el encaje del pliego para TCCT.
2. "resumenFinal.titulares": 2-4 ideas clave del expediente (frases cortas, cada una una bala).
3. "resumenFinal.puntosFuertes": 2-4 razones por las que TCCT encaja bien (certificaciones, experiencia, capacidad de equipo, tecnología).
4. "resumenFinal.riesgos": 1-3 riesgos o puntos de atención para la oferta (peso del precio, solvencia exigida, plazos ajustados).
5. "resumenFinal.recomendacion": un párrafo (2-4 frases) con la recomendación de posicionamiento.

Instrucciones:
- Español profesional, orientado a negocio, conciso. Nada de markdown ni viñetas dentro de los strings.
- Fundaméntate SOLO en los datos aportados; no inventes cifras, certificaciones ni requisitos que no aparezcan.
- Distingue el framing (nueva necesidad / renovación / ampliación) si se deduce del objeto.`;

// Gemelo en JSON Schema de presentationContentSchema (Zod) — se repiten a propósito,
// son DSLs distintos (JSON Schema para Structured Outputs, Zod para validar la salida).
const PRESENTATION_CONTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tagline: { type: 'string' },
    resumenFinal: {
      type: 'object',
      additionalProperties: false,
      properties: {
        titulares: { type: 'array', items: { type: 'string' } },
        puntosFuertes: { type: 'array', items: { type: 'string' } },
        riesgos: { type: 'array', items: { type: 'string' } },
        recomendacion: { type: 'string' },
      },
      required: ['titulares', 'puntosFuertes', 'riesgos', 'recomendacion'],
    },
  },
  required: ['tagline', 'resumenFinal'],
};

function getAnthropicResult(message) {
  if (message.stop_reason === 'max_tokens') {
    throw new Error('La respuesta JSON se ha cortado por límite de tokens de salida.');
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
  if (err?.status === 401) return 'La API key de Anthropic no es válida o ha sido revocada.';
  if (err?.status === 403) return 'La API key de Anthropic no tiene permisos para usar este modelo o recurso.';
  if (err?.status === 429) return 'Anthropic ha limitado la petición por cuota o rate limit. Inténtalo de nuevo en unos minutos.';
  if (err?.status === 400 && err?.message?.includes('credit')) return 'La cuenta de Anthropic no tiene créditos disponibles o billing configurado.';
  if (err?.message?.includes('límite de tokens')) return 'La síntesis se ha cortado por límite de tokens. Inténtalo de nuevo.';
  if (err?.message?.includes('JSON válido')) return 'Claude ha respondido, pero la síntesis no encaja con el formato esperado.';
  return 'No se ha podido generar la presentación. Inténtalo de nuevo.';
}

// Compacta el pliego para dárselo a Claude como contexto de la síntesis (sin ruido).
function buildAnalysisContext(pliego) {
  const { analysisData, ...cabecera } = pliego;
  return JSON.stringify({ cabecera, analisis: analysisData });
}

// Carga scoped para que un ID de otro tenant sea indistinguible de uno inexistente.
export async function getPresentationPliego(client, id, organizationId) {
  return client.pliego.findFirst({ where: { id, organizationId } });
}

// Prisma devuelve fechaLimite como Date, mientras el schema del transporte acepta el
// string normalizado que usa el frontend. El resto de la fila puede validarse tal cual.
function toPresentationInput(row) {
  return {
    ...row,
    fechaLimite: row.fechaLimite instanceof Date ? row.fechaLimite.toISOString() : row.fechaLimite,
  };
}

// Bloque 3: el guard verifica membership y después recargamos el pliego scoped. El body
// cliente deja de ser fuente de datos para Claude: evita presentar información stale o
// manipulada y garantiza que metering/render pertenecen a ctx.orgId.
// `client` es inyectable para tests; Vercel llama con dos argumentos → singleton real.
export default async function handler(req, res, client = prisma) {
  const ctx = await requireMember(req, res, { client });
  if (!ctx) return; // requireMember ya ha respondido 400/401/403/500

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  let storedPliego;
  try {
    storedPliego = await getPresentationPliego(client, req.query?.id, ctx.orgId);
  } catch (err) {
    console.error('Error verificando el pliego para la presentación:', err);
    res.status(500).json({ error: 'No se ha podido verificar el pliego.' });
    return;
  }
  if (!storedPliego) {
    res.status(404).json({ error: 'Pliego no encontrado.' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en el entorno del servidor.' });
    return;
  }

  const parsed = presentationRequestSchema.safeParse(toPresentationInput(storedPliego));
  if (!parsed.success) {
    res.status(400).json({ error: 'El pliego no es válido o no está analizado.', details: parsed.error.flatten() });
    return;
  }
  const pliego = parsed.data;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: PRESENTATION_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Datos del pliego a sintetizar:\n\n${buildAnalysisContext(pliego)}` },
          ],
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: PRESENTATION_CONTENT_SCHEMA,
        },
      },
    });

    const raw = getAnthropicResult(response);
    const check = presentationContentSchema.safeParse(raw);
    if (!check.success) {
      console.error('Síntesis de Claude no válida:', check.error);
      res.status(502).json({ error: 'Claude ha devuelto un JSON válido, pero no coincide con el formato esperado.' });
      return;
    }

    // Metering: una fila por operación LLM (no lanza nunca — la presentación no debe
    // fallar porque el metering falle).
    await withTenant(client, ctx.orgId, (db) => recordUsage(db, {
      organizationId: ctx.orgId,
      userId: ctx.user.id,
      type: 'presentation',
      model: MODEL,
      usage: response.usage,
      pliegoId: pliego.id,
    }));

    const { tagline, resumenFinal } = check.data;
    const specs = buildSlideSpecs({ pliego, analysisData: pliego.analysisData, tagline, resumenFinal });
    const buffer = await renderPptx(specs, { expediente: pliego.expediente });

    const filename = presentationFilename(pliego);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.status(200).send(buffer);
  } catch (err) {
    console.error('Error generando la presentación:', err);
    res.status(502).json({ error: getClientErrorMessage(err) });
  }
}
