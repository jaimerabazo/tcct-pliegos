// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect } from 'vitest';
import handler, { getPliego, updatePliego } from './[id].js';
import { createFakePliegoPrisma } from '../_lib/testFakePrisma.js';
import { createFakeRes } from '../_lib/testFakeRes.js';
import { authHeaders, TEST_USER } from '../_lib/testAuth.js';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const tenancy = {
  organizations: [
    { id: ORG_A, name: 'Org A', slug: 'org-a' },
    { id: ORG_B, name: 'Org B', slug: 'org-b' },
  ],
  memberships: [{ userId: TEST_USER.id, organizationId: ORG_A, role: 'member' }],
};

// Token válido + org activa, como los mandaría el frontend real.
const headers = { ...(await authHeaders()), 'x-organization-id': ORG_A };

const baseRow = {
  id: 'a',
  organizationId: ORG_A,
  expediente: '2026/0001',
  titulo: 'Pliego de prueba',
  organismo: 'Organismo de Prueba',
  importe: 1000000,
  lotes: 1,
  estado: 'analizado',
  procedimiento: 'Abierto',
  ens: 'Alto',
  fechaAnalisis: new Date('2026-01-01'),
};

// El pliego de la Org B: existe en la BD, pero para la Org A no debe ni "existir".
const rowDeB = { ...baseRow, id: 'b', organizationId: ORG_B, expediente: '2026/0009' };

const fakePrisma = (rows = [baseRow, rowDeB]) => createFakePliegoPrisma(rows, tenancy);

describe('getPliego (scoped)', () => {
  it('devuelve el pliego cuando existe EN la org', async () => {
    expect(await getPliego(fakePrisma(), 'a', ORG_A)).toMatchObject({ id: 'a' });
  });

  it('devuelve null si el pliego es de OTRA org (cross-tenant)', async () => {
    expect(await getPliego(fakePrisma(), 'b', ORG_A)).toBeNull();
  });

  it('devuelve null cuando no existe', async () => {
    expect(await getPliego(fakePrisma([]), 'no-existe', ORG_A)).toBeNull();
  });
});

describe('updatePliego (scoped)', () => {
  it('actualiza los campos indicados y conserva el resto', async () => {
    const updated = await updatePliego(fakePrisma(), 'a', ORG_A, { importe: 2000000 });
    expect(updated.importe).toBe(2000000);
    expect(updated.titulo).toBe(baseRow.titulo);
  });

  it('lanza P2025 si el pliego no existe', async () => {
    await expect(updatePliego(fakePrisma([]), 'no-existe', ORG_A, { importe: 1 })).rejects.toMatchObject({ code: 'P2025' });
  });

  it('lanza P2025 si el pliego es de OTRA org, y el pliego queda intacto', async () => {
    const prisma = fakePrisma();
    await expect(updatePliego(prisma, 'b', ORG_A, { importe: 1 })).rejects.toMatchObject({ code: 'P2025' });
    const intacto = await prisma.pliego.findUnique({ where: { id: 'b' } });
    expect(intacto.importe).toBe(baseRow.importe);
  });
});

describe('handler /api/pliegos/[id]', () => {
  it('responde 401 sin token (GET y PATCH)', async () => {
    let res = createFakeRes();
    await handler({ method: 'GET', headers: {}, query: { id: 'a' } }, res, fakePrisma());
    expect(res.statusCode).toBe(401);
    res = createFakeRes();
    await handler({ method: 'PATCH', headers: { authorization: 'Bearer basura' }, query: { id: 'a' }, body: { importe: 1 } }, res, fakePrisma());
    expect(res.statusCode).toBe(401);
  });

  it('responde 400 sin cabecera X-Organization-Id', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers: await authHeaders(), query: { id: 'a' } }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
  });

  it('responde 403 si afirma una org donde no tiene membership', async () => {
    const res = createFakeRes();
    const reqHeaders = { ...(await authHeaders()), 'x-organization-id': ORG_B };
    await handler({ method: 'GET', headers: reqHeaders, query: { id: 'b' } }, res, fakePrisma());
    expect(res.statusCode).toBe(403);
  });

  it('GET responde 200 con el pliego', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'a' } }, res, fakePrisma());
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('a');
  });

  it('GET responde 404 si no existe', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'no-existe' } }, res, fakePrisma([]));
    expect(res.statusCode).toBe(404);
  });

  it('GET responde 404 (no 403) para un pliego de OTRA org — no revelar existencia', async () => {
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'b' } }, res, fakePrisma());
    expect(res.statusCode).toBe(404);
  });

  it('GET responde 500 si la consulta falla', async () => {
    const prisma = fakePrisma();
    prisma.pliego.findFirst = () => { throw new Error('boom'); };
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'a' } }, res, prisma);
    expect(res.statusCode).toBe(500);
  });

  it('PATCH responde 200 con el pliego actualizado y firma updatedBy', async () => {
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: { importe: 3000000 } }, res, fakePrisma());
    expect(res.statusCode).toBe(200);
    expect(res.body.importe).toBe(3000000);
    expect(res.body.updatedBy).toBe(TEST_USER.id); // audit ligero de quién editó
  });

  it('PATCH responde 400 si el body no es válido (campo desconocido)', async () => {
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: { id: 'otro-id' } }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toBeTruthy();
  });

  it('PATCH responde 400 si el body está vacío (nada que actualizar)', async () => {
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: {} }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toBeTruthy();
  });

  it('PATCH responde 400 si un campo tiene el tipo equivocado', async () => {
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: { importe: 'no-es-un-numero' } }, res, fakePrisma());
    expect(res.statusCode).toBe(400);
  });

  it('PATCH responde 404 si el pliego no existe', async () => {
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'no-existe' }, body: { importe: 1 } }, res, fakePrisma([]));
    expect(res.statusCode).toBe(404);
  });

  it('PATCH responde 404 para un pliego de OTRA org, que queda intacto', async () => {
    const prisma = fakePrisma();
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'b' }, body: { importe: 1 } }, res, prisma);
    expect(res.statusCode).toBe(404);
    const intacto = await prisma.pliego.findUnique({ where: { id: 'b' } });
    expect(intacto.importe).toBe(baseRow.importe);
  });

  it('PATCH responde 500 ante un error inesperado', async () => {
    const prisma = fakePrisma();
    prisma.pliego.update = () => { throw new Error('boom'); };
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: { importe: 1 } }, res, prisma);
    expect(res.statusCode).toBe(500);
  });

  it('responde 405 para métodos no soportados', async () => {
    const res = createFakeRes();
    await handler({ method: 'DELETE', headers, query: { id: 'a' } }, res, fakePrisma());
    expect(res.statusCode).toBe(405);
  });
});
