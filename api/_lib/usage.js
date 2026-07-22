// Metering (Bloque 3, decisión "usage_events desde el día uno"): una fila en
// usage_events por operación LLM. Los tokens son el hecho durable e indiscutible;
// costEstimate congela el coste al precio de HOY (los precios de Anthropic cambian,
// la contabilidad histórica no se recalcula — ver BLOQUE-1 §1).
//
// La tabla de precios es deliberadamente mínima: solo los modelos que la app usa.
// Precio de lista en USD por millón de tokens (claude-sonnet-5: $3 in / $15 out;
// existe un precio intro más bajo hasta 08/2026 — usamos el de lista, estimación
// conservadora del COGS). Modelo desconocido → costEstimate null, los tokens quedan
// registrados igualmente y el Bloque 4 puede recalcular.
const PRICE_USD_PER_MTOK = {
  'claude-sonnet-5': { input: 3, output: 15 },
};

// Pura y testeable: coste estimado en USD, o null si no conocemos el precio del modelo.
export function estimateCost(model, tokensIn, tokensOut) {
  const price = PRICE_USD_PER_MTOK[model];
  if (!price) return null;
  return (tokensIn * price.input + tokensOut * price.output) / 1_000_000;
}

// Inserta el evento de metering. NUNCA lanza: el análisis/presentación del usuario no
// debe fallar porque el metering tenga un mal día — se loguea y se sigue. (Cuando el
// metering sea la base de límites de plan en el Bloque 4, este trade-off se revisará.)
export async function recordUsage(client, { organizationId, userId, type, model, usage, pliegoId = null }) {
  const tokensIn = usage?.input_tokens ?? 0;
  const tokensOut = usage?.output_tokens ?? 0;
  try {
    return await client.usageEvent.create({
      data: {
        organizationId,
        userId,
        type,
        tokensIn,
        tokensOut,
        costEstimate: estimateCost(model, tokensIn, tokensOut),
        pliegoId,
      },
    });
  } catch (err) {
    console.error('No se ha podido registrar el usage_event:', err);
    return null;
  }
}
