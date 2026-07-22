// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect, vi } from 'vitest';
// Importar testAuth.js instala el secret de test en process.env (side effect documentado).
import { TEST_USER, authHeaders } from './testAuth.js';
import { createFakePliegoPrisma } from './testFakePrisma.js';
import { createFakeRes } from './testFakeRes.js';
import { requireMember } from './authz.js';

const ORG = { id: 'org-a', name: 'Org A', slug: 'org-a' };
const ORG_BORRADA = { id: 'org-x', name: 'Org X', slug: 'org-x', deletedAt: new Date('2026-07-01') };

// Doble con el usuario de test como member de org-a y owner de org-o.
function fakeClient({ memberships, organizations } = {}) {
  return createFakePliegoPrisma([], {
    organizations: organizations ?? [ORG, { id: 'org-o', name: 'Org O', slug: 'org-o' }, ORG_BORRADA],
    memberships: memberships ?? [
      { userId: TEST_USER.id, organizationId: 'org-a', role: 'member' },
      { userId: TEST_USER.id, organizationId: 'org-o', role: 'owner' },
      { userId: TEST_USER.id, organizationId: 'org-x', role: 'owner' },
    ],
  });
}

async function reqFor(orgId, extraHeaders = {}) {
  return { headers: { ...(await authHeaders()), ...(orgId ? { 'x-organization-id': orgId } : {}), ...extraHeaders } };
}

describe('requireMember', () => {
  it('401 sin token (fallo de identidad, delegado en requireUser)', async () => {
    const res = createFakeRes();
    const ctx = await requireMember({ headers: { 'x-organization-id': 'org-a' } }, res, { client: fakeClient() });
    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('400 sin cabecera X-Organization-Id (petición malformada)', async () => {
    const res = createFakeRes();
    const ctx = await requireMember({ headers: await authHeaders() }, res, { client: fakeClient() });
    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/X-Organization-Id/);
  });

  it('403 si el usuario no tiene membership en la org que afirma el header', async () => {
    const res = createFakeRes();
    const ctx = await requireMember(await reqFor('org-ajena'), res, { client: fakeClient() });
    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/organización/i);
  });

  it('500 JSON si falla la consulta de membership', async () => {
    const client = fakeClient();
    client.membership.findUnique = async () => { throw new Error('database unavailable'); };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createFakeRes();

    const ctx = await requireMember(await reqFor('org-a'), res, { client });

    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/verificar el acceso/i);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('403 si la org está desactivada (soft-delete, decisión D3) aunque haya membership', async () => {
    const res = createFakeRes();
    const ctx = await requireMember(await reqFor('org-x'), res, { client: fakeClient() });
    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/desactivada/i);
  });

  it('403 si se exige owner y el rol es member', async () => {
    const res = createFakeRes();
    const ctx = await requireMember(await reqFor('org-a'), res, { client: fakeClient(), role: 'owner' });
    expect(ctx).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/owner/i);
  });

  it('devuelve el contexto de request para un member sin exigencia de rol', async () => {
    const res = createFakeRes();
    const ctx = await requireMember(await reqFor('org-a'), res, { client: fakeClient() });
    expect(res.statusCode).toBeNull(); // no ha respondido nada
    expect(ctx).toEqual({
      user: { id: TEST_USER.id, email: TEST_USER.email },
      orgId: 'org-a',
      role: 'member',
    });
  });

  it('deja pasar a un owner cuando se exige owner', async () => {
    const res = createFakeRes();
    const ctx = await requireMember(await reqFor('org-o'), res, { client: fakeClient(), role: 'owner' });
    expect(ctx).toEqual({
      user: { id: TEST_USER.id, email: TEST_USER.email },
      orgId: 'org-o',
      role: 'owner',
    });
  });

  it('un owner también pasa los guards sin exigencia de rol (owner ⊇ member)', async () => {
    const res = createFakeRes();
    const ctx = await requireMember(await reqFor('org-o'), res, { client: fakeClient() });
    expect(ctx?.role).toBe('owner');
  });

  it('membership sin organización cargada no revienta (organization null → no desactivada)', async () => {
    // Caso defensivo: el doble devuelve organization null si la org no existe en su mapa.
    const client = createFakePliegoPrisma([], {
      organizations: [],
      memberships: [{ userId: TEST_USER.id, organizationId: 'org-fantasma', role: 'member' }],
    });
    const res = createFakeRes();
    const ctx = await requireMember(await reqFor('org-fantasma'), res, { client });
    expect(ctx?.orgId).toBe('org-fantasma');
  });
});
