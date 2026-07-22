// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect, vi } from 'vitest';
import handler, { listPliegos } from './index.js';
import { createFakePliegoPrisma } from '../_lib/testFakePrisma.js';
import { createFakeRes } from '../_lib/testFakeRes.js';
import { authHeaders, TEST_USER } from '../_lib/testAuth.js';

// Fixture de tenancy: el usuario de test es member de la Org A; la Org B existe pero
// NO tiene su membership — es "la org del otro cliente" de los escenarios cross-tenant.
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const tenancy = {
  organizations: [
    { id: ORG_A, name: 'Org A', slug: 'org-a' },
    { id: ORG_B, name: 'Org B', slug: 'org-b' },
  ],
  memberships: [{ userId: TEST_USER.id, organizationId: ORG_A, role: 'member' }],
};

const rowA = { id: 'a', organizationId: ORG_A, expediente: '2026/0001', fechaAnalisis: new Date('2026-01-01') };
const rowA2 = { id: 'a2', organizationId: ORG_A, expediente: '2026/0002', fechaAnalisis: new Date('2026-02-01') };
const rowB = { id: 'b', organizationId: ORG_B, expediente: '2026/0003', fechaAnalisis: new Date('2026-03-01') };

const fakePrisma = (rows = [rowA, rowA2, rowB]) => createFakePliegoPrisma(rows, tenancy);

// Token válido + org activa, como los mandaría el frontend real.
const headers = { ...(await authHeaders()), 'x-organization-id': ORG_A };

describe('listPliegos', () => {
  it('devuelve SOLO los pliegos de la org, ordenados por fechaAnalisis descendente', async () => {
    const result = await listPliegos(fakePrisma(), ORG_A);
    expect(result.map((p) => p.id)).toEqual(['a2', 'a']); // nunca el 'b' de la Org B
  });

  it('devuelve un array vacío si la org no tiene pliegos', async () => {
    expect(await listPliegos(fakePrisma([rowB]), ORG_A)).toEqual([]);
  });
});

describe('handler GET /api/pliegos', () => {
  it('responde 200 con la lista scoped a la org del header', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers }, res, fakePrisma());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((p) => p.organizationId === ORG_A)).toBe(true);
  });

  it('responde 401 sin token (y no toca la BD)', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers: {} }, res, fakePrisma());
    expect(res.statusCode).toBe(401);
  });

  it('responde 400 sin cabecera X-Organization-Id', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers: await authHeaders() }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
  });

  it('responde 403 si afirma una org donde no tiene membership', async () => {
    const res = createFakeRes();
    const reqHeaders = { ...(await authHeaders()), 'x-organization-id': ORG_B };
    await handler({ method: 'GET', headers: reqHeaders }, res, fakePrisma());
    expect(res.statusCode).toBe(403);
  });

  it('responde 500 JSON si falla el lookup de membership antes de listar', async () => {
    const prisma = fakePrisma();
    prisma.membership.findUnique = async () => { throw new Error('database unavailable'); };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createFakeRes();

    await handler({ method: 'GET', headers }, res, prisma);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/verificar el acceso/i);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('responde 405 para métodos que no sean GET', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers }, res, fakePrisma());
    expect(res.statusCode).toBe(405);
  });

  it('responde 500 si falla la consulta', async () => {
    const prisma = fakePrisma();
    prisma.pliego.findMany = () => { throw new Error('boom'); };
    const res = createFakeRes();
    await handler({ method: 'GET', headers }, res, prisma);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBeTruthy();
  });
});
