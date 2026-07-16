// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
import { describe, it, expect } from 'vitest';
import handler, { getPliego, updatePliego } from './[id].js';
import { createFakePliegoPrisma } from '../_lib/testFakePrisma.js';
import { createFakeRes } from '../_lib/testFakeRes.js';
import { authHeaders } from '../_lib/testAuth.js';

// Token válido compartido por todos los tests del handler (firmado con el secret de test).
const headers = await authHeaders();

const baseRow = {
  id: 'a',
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

describe('getPliego', () => {
  it('devuelve el pliego cuando existe', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    expect(await getPliego(prisma, 'a')).toMatchObject({ id: 'a' });
  });

  it('devuelve null cuando no existe', async () => {
    const prisma = createFakePliegoPrisma([]);
    expect(await getPliego(prisma, 'no-existe')).toBeNull();
  });
});

describe('updatePliego', () => {
  it('actualiza los campos indicados y conserva el resto', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const updated = await updatePliego(prisma, 'a', { importe: 2000000 });
    expect(updated.importe).toBe(2000000);
    expect(updated.titulo).toBe(baseRow.titulo);
  });

  it('lanza P2025 si el pliego no existe', async () => {
    const prisma = createFakePliegoPrisma([]);
    await expect(updatePliego(prisma, 'no-existe', { importe: 1 })).rejects.toMatchObject({ code: 'P2025' });
  });
});

describe('handler /api/pliegos/[id]', () => {
  it('responde 401 sin token (GET y PATCH)', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    let res = createFakeRes();
    await handler({ method: 'GET', headers: {}, query: { id: 'a' } }, res, prisma);
    expect(res.statusCode).toBe(401);
    res = createFakeRes();
    await handler({ method: 'PATCH', headers: { authorization: 'Bearer basura' }, query: { id: 'a' }, body: { importe: 1 } }, res, prisma);
    expect(res.statusCode).toBe(401);
  });

  it('GET responde 200 con el pliego', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'a' } }, res, prisma);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('a');
  });

  it('GET responde 404 si no existe', async () => {
    const prisma = createFakePliegoPrisma([]);
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'no-existe' } }, res, prisma);
    expect(res.statusCode).toBe(404);
  });

  it('GET responde 500 si la consulta falla', async () => {
    const prisma = { pliego: { findUnique: () => { throw new Error('boom'); } } };
    const res = createFakeRes();
    await handler({ method: 'GET', headers, query: { id: 'a' } }, res, prisma);
    expect(res.statusCode).toBe(500);
  });

  it('PATCH responde 200 con el pliego actualizado', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: { importe: 3000000 } }, res, prisma);
    expect(res.statusCode).toBe(200);
    expect(res.body.importe).toBe(3000000);
  });

  it('PATCH responde 400 si el body no es válido (campo desconocido)', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: { id: 'otro-id' } }, res, prisma);
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toBeTruthy();
  });

  it('PATCH responde 400 si el body está vacío (nada que actualizar)', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: {} }, res, prisma);
    expect(res.statusCode).toBe(400);
    expect(res.body.details).toBeTruthy();
  });

  it('PATCH responde 400 si un campo tiene el tipo equivocado', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: { importe: 'no-es-un-numero' } }, res, prisma);
    expect(res.statusCode).toBe(400);
  });

  it('PATCH responde 404 si el pliego no existe', async () => {
    const prisma = createFakePliegoPrisma([]);
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'no-existe' }, body: { importe: 1 } }, res, prisma);
    expect(res.statusCode).toBe(404);
  });

  it('PATCH responde 500 ante un error inesperado', async () => {
    const prisma = { pliego: { update: () => { throw new Error('boom'); } } };
    const res = createFakeRes();
    await handler({ method: 'PATCH', headers, query: { id: 'a' }, body: { importe: 1 } }, res, prisma);
    expect(res.statusCode).toBe(500);
  });

  it('responde 405 para métodos no soportados', async () => {
    const prisma = createFakePliegoPrisma([baseRow]);
    const res = createFakeRes();
    await handler({ method: 'DELETE', headers, query: { id: 'a' } }, res, prisma);
    expect(res.statusCode).toBe(405);
  });
});
