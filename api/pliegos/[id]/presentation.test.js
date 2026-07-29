// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
//
// El handler completo (Claude + renderPptx) se verifica a mano, no por CI — mismo
// criterio que api/analyze.js. Pero auth y el lookup scoped corren ANTES de tocar
// Claude, así que sí se testean: son la barrera de seguridad del endpoint más caro.
import { describe, it, expect, vi } from 'vitest';
import handler, { getPresentationPliego } from './presentation.js';
import { createFakePliegoPrisma } from '../../_lib/testFakePrisma.js';
import { createFakeRes } from '../../_lib/testFakeRes.js';
import { authHeaders, TEST_USER } from '../../_lib/testAuth.js';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const rowA = { id: 'a', organizationId: ORG_A, expediente: '2026/0001' };
const rowB = { id: 'b', organizationId: ORG_B, expediente: '2026/0002' };
const tenancy = {
  organizations: [
    { id: ORG_A, name: 'Org A', slug: 'org-a' },
    { id: ORG_B, name: 'Org B', slug: 'org-b' },
  ],
  memberships: [{ userId: TEST_USER.id, organizationId: ORG_A, role: 'member' }],
};
const fakePrisma = () => createFakePliegoPrisma([rowA, rowB], tenancy);
const headers = { ...(await authHeaders()), 'x-organization-id': ORG_A };

describe('getPresentationPliego (scoped)', () => {
  it('devuelve el pliego de la organización activa', async () => {
    await expect(getPresentationPliego(fakePrisma(), 'a', ORG_A)).resolves.toMatchObject({ id: 'a' });
  });

  it('oculta un pliego de otra organización', async () => {
    await expect(getPresentationPliego(fakePrisma(), 'b', ORG_A)).resolves.toBeNull();
  });
});

describe('handler POST /api/pliegos/[id]/presentation — auth', () => {
  it('responde 401 sin token, antes de validar el body o llamar a Claude', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('responde 401 con token inválido', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer basura' }, body: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('responde 404 para un pliego de otra org antes de usar Claude', async () => {
    const client = fakePrisma();
    const transaction = vi.spyOn(client, '$transaction');
    const res = createFakeRes();
    await handler({
      method: 'POST',
      headers,
      query: { id: 'b' },
      body: { ...rowB, analysisData: {} },
    }, res, client);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/no encontrado/i);
    // Una transacción verifica la membership por app.user_id y otra carga el pliego
    // con app.org_id; ambas deben quedar bajo sus respectivas políticas RLS.
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('responde 500 JSON si falla la comprobación scoped', async () => {
    const client = fakePrisma();
    client.pliego.findFirst = async () => { throw new Error('database unavailable'); };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createFakeRes();

    await handler({ method: 'POST', headers, query: { id: 'a' }, body: {} }, res, client);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/verificar el pliego/i);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
