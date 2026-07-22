// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { estimateCost, recordUsage } from './usage.js';
import { createFakePliegoPrisma } from './testFakePrisma.js';

describe('estimateCost', () => {
  it('calcula el coste con el precio de lista de claude-sonnet-5 ($3 in / $15 out por MTok)', () => {
    // 1M de entrada + 1M de salida = 3 + 15 = 18 USD
    expect(estimateCost('claude-sonnet-5', 1_000_000, 1_000_000)).toBe(18);
  });

  it('escala linealmente con los tokens', () => {
    expect(estimateCost('claude-sonnet-5', 10_000, 2_000)).toBeCloseTo(0.06, 6);
  });

  it('devuelve null para un modelo sin precio conocido (los tokens se registran igual)', () => {
    expect(estimateCost('claude-opus-4-8', 1000, 1000)).toBeNull();
  });
});

describe('recordUsage', () => {
  const base = {
    organizationId: 'org-a',
    userId: 'user-1',
    type: 'analyze',
    model: 'claude-sonnet-5',
    usage: { input_tokens: 5000, output_tokens: 1500 },
    pliegoId: 'pliego-1',
  };

  it('inserta el evento con tokens, coste estimado y pliegoId', async () => {
    const prisma = createFakePliegoPrisma();
    const event = await recordUsage(prisma, base);
    expect(event).toMatchObject({
      organizationId: 'org-a',
      userId: 'user-1',
      type: 'analyze',
      tokensIn: 5000,
      tokensOut: 1500,
      pliegoId: 'pliego-1',
    });
    expect(event.costEstimate).toBeCloseTo((5000 * 3 + 1500 * 15) / 1_000_000, 9);
    expect(await prisma.usageEvent.findMany({ where: { organizationId: 'org-a' } })).toHaveLength(1);
  });

  it('tolera una respuesta sin usage (tokens a 0) y sin pliegoId', async () => {
    const prisma = createFakePliegoPrisma();
    const event = await recordUsage(prisma, { ...base, usage: undefined, pliegoId: undefined });
    expect(event).toMatchObject({ tokensIn: 0, tokensOut: 0, pliegoId: null });
  });

  it('NUNCA lanza: si la BD falla, loguea y devuelve null (la operación del usuario no se rompe)', async () => {
    const prisma = { usageEvent: { create: () => { throw new Error('boom'); } } };
    await expect(recordUsage(prisma, base)).resolves.toBeNull();
  });
});
