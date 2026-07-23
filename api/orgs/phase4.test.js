// @vitest-environment node
import { describe, expect, it } from 'vitest';
import invitationHandler from './[id]/invitations.js';
import membersHandler from './[id]/members/index.js';
import removeMemberHandler from './[id]/members/[userId].js';
import acceptHandler from '../invitations/accept.js';
import { createFakePliegoPrisma } from '../_lib/testFakePrisma.js';
import { createFakeRes } from '../_lib/testFakeRes.js';
import { authHeaders, TEST_USER } from '../_lib/testAuth.js';

const ownerHeaders = {
  ...(await authHeaders()),
  'x-organization-id': 'org-a',
};

function captureAuthInvite() {
  const calls = [];
  return {
    calls,
    env: { APP_URL: 'https://app.example.com' },
    inviteUser: async (...args) => { calls.push(args); },
  };
}

function fakePrisma() {
  return createFakePliegoPrisma([], {
    organizations: [{ id: 'org-a', name: 'Org A', slug: 'org-a', plan: 'trial' }],
    memberships: [
      { userId: TEST_USER.id, organizationId: 'org-a', role: 'owner' },
      { userId: 'member-1', organizationId: 'org-a', role: 'member' },
    ],
  });
}

describe('fase 4: invitaciones y miembros', () => {
  it('crea y acepta una invitación sin guardar el token en claro', async () => {
    const prisma = fakePrisma();
    const authInvite = captureAuthInvite();
    const createRes = createFakeRes();
    await invitationHandler({
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'new@example.com', role: 'member' },
    }, createRes, prisma, authInvite);

    expect(createRes.statusCode).toBe(201);
    expect(createRes.body.token).toBeUndefined();
    expect(authInvite.calls[0][0]).toBe('new@example.com');
    const invitationUrl = new URL(authInvite.calls[0][1]);
    const token = invitationUrl.searchParams.get('invitation');
    expect(token.length).toBeGreaterThanOrEqual(32);
    const stored = await prisma.invitation.findMany({ where: { organizationId: 'org-a' } });
    expect(stored[0].tokenHash).not.toBe(token);

    const acceptRes = createFakeRes();
    await acceptHandler({
      method: 'POST',
      headers: await authHeaders({ sub: 'new-user', email: 'new@example.com' }),
      body: { token },
    }, acceptRes, prisma);
    expect(acceptRes.statusCode).toBe(200);
    expect(acceptRes.body).toMatchObject({ organizationId: 'org-a', role: 'member' });
  });

  it('solo permite a owners operar sobre la organización declarada', async () => {
    const prisma = fakePrisma();
    const memberHeaders = {
      ...(await authHeaders({ sub: 'member-1', email: 'member@example.com' })),
      'x-organization-id': 'org-a',
    };
    const forbidden = createFakeRes();
    await invitationHandler({
      method: 'POST',
      headers: memberHeaders,
      query: { id: 'org-a' },
      body: { email: 'new@example.com' },
    }, forbidden, prisma);
    expect(forbidden.statusCode).toBe(403);

    const wrongPath = createFakeRes();
    await membersHandler({
      method: 'GET',
      headers: ownerHeaders,
      query: { id: 'org-b' },
    }, wrongPath, prisma);
    expect(wrongPath.statusCode).toBe(404);
  });

  it('lista miembros y permite al owner quitar un member', async () => {
    const prisma = fakePrisma();
    const listRes = createFakeRes();
    await membersHandler({
      method: 'GET',
      headers: ownerHeaders,
      query: { id: 'org-a' },
    }, listRes, prisma);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toHaveLength(2);

    const removeRes = createFakeRes();
    await removeMemberHandler({
      method: 'DELETE',
      headers: ownerHeaders,
      query: { id: 'org-a', userId: 'member-1' },
    }, removeRes, prisma);
    expect(removeRes.statusCode).toBe(204);
  });

  it('rechaza que el último owner se quite a sí mismo', async () => {
    const prisma = fakePrisma();
    const res = createFakeRes();
    await removeMemberHandler({
      method: 'DELETE',
      headers: ownerHeaders,
      query: { id: 'org-a', userId: TEST_USER.id },
    }, res, prisma);
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/último owner/i);
  });

  it('rechaza una invitación aceptada con otro email', async () => {
    const prisma = fakePrisma();
    const authInvite = captureAuthInvite();
    const createRes = createFakeRes();
    await invitationHandler({
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'right@example.com' },
    }, createRes, prisma, authInvite);
    const token = new URL(authInvite.calls[0][1]).searchParams.get('invitation');

    const res = createFakeRes();
    await acceptHandler({
      method: 'POST',
      headers: await authHeaders({ sub: 'wrong-user', email: 'wrong@example.com' }),
      body: { token },
    }, res, prisma);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/otro email/i);
  });

  it.each([
    'La invitación no existe.',
    'La invitación ha caducado.',
    'La invitación pertenece a otro email.',
  ])('responde 400 para el P0001 real de Prisma 7: %s', async (message) => {
    const prismaError = new Error(
      `Raw query failed. Code: \`P0001\`. Message: \`ERROR: ${message}\``,
    );
    prismaError.code = 'P2010';
    prismaError.meta = {
      driverAdapterError: {
        cause: {
          kind: 'PostgresError',
          originalCode: 'P0001',
          originalMessage: `ERROR: ${message}`,
        },
      },
    };
    const prisma = {
      $queryRaw: async () => {
        throw prismaError;
      },
    };
    const res = createFakeRes();

    await acceptHandler({
      method: 'POST',
      headers: await authHeaders({ sub: 'invited-user', email: 'invited@example.com' }),
      body: { token: 'token-secreto-de-prueba-con-mas-de-32-caracteres' },
    }, res, prisma);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: message });
  });

  it('valida métodos, bodies y duplicados de invitación', async () => {
    const prisma = fakePrisma();
    const badMethod = createFakeRes();
    await invitationHandler({
      method: 'GET', headers: ownerHeaders, query: { id: 'org-a' },
    }, badMethod, prisma);
    expect(badMethod.statusCode).toBe(405);

    const badBody = createFakeRes();
    await invitationHandler({
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'no-es-email' },
    }, badBody, prisma);
    expect(badBody.statusCode).toBe(400);

    const request = {
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'duplicate@example.com' },
    };
    const authInvite = captureAuthInvite();
    await invitationHandler(request, createFakeRes(), prisma, authInvite);
    const duplicate = createFakeRes();
    await invitationHandler(request, duplicate, prisma, authInvite);
    expect(duplicate.statusCode).toBe(409);
  });

  it('revierte la fila si Supabase Auth no puede provisionar al usuario', async () => {
    const prisma = fakePrisma();
    const res = createFakeRes();
    await invitationHandler({
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'new@example.com', role: 'member' },
    }, res, prisma, {
      env: { APP_URL: 'https://app.example.com' },
      inviteUser: async () => {
        const error = new Error('fallo de Supabase');
        error.code = 'AUTH_INVITE_FAILED';
        throw error;
      },
    });

    expect(res.statusCode).toBe(502);
    expect(await prisma.invitation.findMany({ where: { organizationId: 'org-a' } })).toEqual([]);
  });

  it('falla cerrado y revierte la fila si no hay una URL pública configurada', async () => {
    const prisma = fakePrisma();
    const res = createFakeRes();
    await invitationHandler({
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'new@example.com', role: 'member' },
    }, res, prisma, {
      env: {},
      inviteUser: async () => {
        throw new Error('No debería intentar enviar sin URL.');
      },
    });

    expect(res.statusCode).toBe(503);
    expect(await prisma.invitation.findMany({ where: { organizationId: 'org-a' } })).toEqual([]);
  });

  it('valida métodos y miembros inexistentes', async () => {
    const prisma = fakePrisma();
    const listMethod = createFakeRes();
    await membersHandler({
      method: 'POST', headers: ownerHeaders, query: { id: 'org-a' },
    }, listMethod, prisma);
    expect(listMethod.statusCode).toBe(405);

    const removeMethod = createFakeRes();
    await removeMemberHandler({
      method: 'GET',
      headers: ownerHeaders,
      query: { id: 'org-a', userId: 'member-1' },
    }, removeMethod, prisma);
    expect(removeMethod.statusCode).toBe(405);

    const missing = createFakeRes();
    await removeMemberHandler({
      method: 'DELETE',
      headers: ownerHeaders,
      query: { id: 'org-a', userId: 'missing' },
    }, missing, prisma);
    expect(missing.statusCode).toBe(404);
  });

  it('valida método, token y email al aceptar', async () => {
    const prisma = fakePrisma();
    const method = createFakeRes();
    await acceptHandler({
      method: 'GET',
      headers: await authHeaders(),
    }, method, prisma);
    expect(method.statusCode).toBe(405);

    const token = createFakeRes();
    await acceptHandler({
      method: 'POST',
      headers: await authHeaders(),
      body: { token: 'corto' },
    }, token, prisma);
    expect(token.statusCode).toBe(400);

    const email = createFakeRes();
    await acceptHandler({
      method: 'POST',
      headers: await authHeaders({ email: null }),
      body: { token: 'token-secreto-de-prueba-con-mas-de-32-caracteres' },
    }, email, prisma);
    expect(email.statusCode).toBe(400);
    expect(email.body.error).toMatch(/email verificable/i);
  });
});
