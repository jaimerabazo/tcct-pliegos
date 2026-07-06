import OpenAI, { toFile } from 'openai';

export const config = {
  maxDuration: 60,
};

const MODEL = 'gpt-4o';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido.' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'Falta configurar OPENAI_API_KEY en el entorno del servidor.' });
    return;
  }

  const pdfBuffer = await readRequestBody(req);
  if (!pdfBuffer.length) {
    res.status(400).json({ error: 'No se ha recibido ningún archivo.' });
    return;
  }

  const filename = decodeURIComponent(req.headers['x-filename'] || 'pliego.pdf');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  let uploadedFile;
  try {
    uploadedFile = await openai.files.create({
      file: await toFile(pdfBuffer, filename, { type: 'application/pdf' }),
      purpose: 'user_data',
    });

    const response = await openai.responses.create({
      model: MODEL,
      input: [
        { role: 'system', content: EXTRACTION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'input_file', file_id: uploadedFile.id },
            { type: 'input_text', text: 'Extrae los datos estructurados de este pliego de licitación pública.' },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'pliego_analysis',
          schema: PLIEGO_ANALYSIS_SCHEMA,
          strict: true,
        },
      },
    });

    const result = JSON.parse(response.output_text);
    res.status(200).json(result);
  } catch (err) {
    console.error('Error analizando el pliego:', err);
    res.status(502).json({ error: 'No se ha podido analizar el documento. Inténtalo de nuevo.' });
  } finally {
    if (uploadedFile) {
      openai.files.delete(uploadedFile.id).catch(() => {});
    }
  }
}
