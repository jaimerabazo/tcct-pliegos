// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect } from 'vitest';
import handler, { listMyOrgs } from './index.js';
import { createFakePliegoPrisma } from '../_lib/testFakePrisma.js';
import { createFakeRes } from '../_lib/testFakeRes.js';
import { authHeaders, TEST_USER } from '../_lib/testAuth.js';

const fakePrisma = () => createFakePliegoPrisma([], {
  organizations: [
    { id: 'org-a', name: 'Org A', slug: 'org-a', plan: 'trial' },
    { id: 'org-o', name: 'Org O', slug: 'org-o', plan: 'pro' },
    { id: 'org-x', name: 'Org X', slug: 'org-x', plan: 'trial', deletedAt: new Date('2026-07-01') },
    { id: 'org-ajena', name: 'Ajena', slug: 'ajena', plan: 'trial' },
  ],
  memberships: [
    { userId: TEST_USER.id, organizationId: 'org-a', role: 'member' },
    { userId: TEST_USER.id, organizationId: 'org-o', role: 'owner' },
    { userId: TEST_USER.id, organizationId: 'org-x', role: 'owner' }, // org desactivada
    { userId: 'otro-usuario', organizationId: 'org-ajena', role: 'owner' },
  ],
});

const headers = await authHeaders();

describe('listMyOrgs', () => {
  it('devuelve las orgs del usuario con su rol en cada una', async () => {
    const orgs = await listMyOrgs(fakePrisma(), TEST_USER.id);
    expect(orgs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'org-a', role: 'member', plan: 'trial' }),
      expect.objectContaining({ id: 'org-o', role: 'owner', plan: 'pro' }),
    ]));
  });

  it('excluye las orgs desactivadas (soft-delete D3) y las de otros usuarios', async () => {
    const orgs = await listMyOrgs(fakePrisma(), TEST_USER.id);
    const ids = orgs.map((o) => o.id);
    expect(ids).not.toContain('org-x');
    expect(ids).not.toContain('org-ajena');
    expect(orgs).toHaveLength(2);
  });

  it('devuelve un array vacío para un usuario sin memberships', async () => {
    expect(await listMyOrgs(fakePrisma(), 'usuario-sin-orgs')).toEqual([]);
  });
});

describe('handler GET /api/orgs', () => {
  it('responde 200 con las orgs del usuario del token (sin necesitar X-Organization-Id: es el bootstrap)', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers }, res, fakePrisma());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('responde 401 sin token', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers: {} }, res, fakePrisma());
    expect(res.statusCode).toBe(401);
  });

  it('responde 405 para métodos no soportados', async () => {
    const res = createFakeRes();
    await handler({ method: 'PUT', headers }, res, fakePrisma());
    expect(res.statusCode).toBe(405);
  });

  it('crea una organización y convierte al usuario en owner', async () => {
    const prisma = fakePrisma();
    const res = createFakeRes();
    await handler({ method: 'POST', headers, body: { name: 'Nueva Consultora' } }, res, prisma);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ name: 'Nueva Consultora', slug: 'nueva-consultora', role: 'owner' });
    expect(await listMyOrgs(prisma, TEST_USER.id)).toContainEqual(expect.objectContaining({
      id: res.body.id,
      role: 'owner',
    }));
  });

  it('rechaza nombres de organización inválidos', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers, body: { name: ' ' } }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
  });

  it('responde 500 si falla la consulta', async () => {
    const prisma = fakePrisma();
    prisma.membership.findMany = () => { throw new Error('boom'); };
    const res = createFakeRes();
    await handler({ method: 'GET', headers }, res, prisma);
    expect(res.statusCode).toBe(500);
  });
});
