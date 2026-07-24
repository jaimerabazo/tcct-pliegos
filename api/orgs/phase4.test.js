// @vitest-environment node
import { describe, expect, it } from 'vitest';
import invitationHandler from './[id]/invitations.js';
import revokeInvitationHandler from './[id]/invitations/[invitationId].js';
import membersHandler from './[id]/members/index.js';
import removeMemberHandler from './[id]/members/[userId].js';
import acceptHandler from '../invitations/accept.js';
import { createFakePliegoPrisma } from '../_lib/testFakePrisma.js';
import { createFakeRes } from '../_lib/testFakeRes.js';
import { authHeaders, TEST_USER } from '../_lib/testAuth.js';
import { inviteUserByEmail } from '../_lib/supabaseAdmin.js';
import { hashInvitationToken } from '../_lib/organizations.js';

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

  it('conserva la invitación y envía magic link si el usuario ya existe en Auth', async () => {
    const prisma = fakePrisma();
    const magicLinkCalls = [];
    const authClient = {
      auth: {
        admin: {
          inviteUserByEmail: async () => ({
            data: { user: null },
            error: { code: 'email_exists', status: 422 },
          }),
        },
        signInWithOtp: async (credentials) => {
          magicLinkCalls.push(credentials);
          return { data: {}, error: null };
        },
      },
    };
    const res = createFakeRes();

    await invitationHandler({
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'existing@example.com', role: 'owner' },
    }, res, prisma, {
      env: { APP_URL: 'https://app.example.com' },
      inviteUser: (email, redirectTo) => inviteUserByEmail(
        email,
        redirectTo,
        { client: authClient },
      ),
    });

    expect(res.statusCode).toBe(201);
    expect(await prisma.invitation.findMany({
      where: { organizationId: 'org-a' },
    })).toHaveLength(1);
    expect(magicLinkCalls).toEqual([{
      email: 'existing@example.com',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: expect.stringContaining('invitation='),
      },
    }]);
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

  it('lista miembros con email y permite al owner quitar un member', async () => {
    const prisma = fakePrisma();
    // resolveEmails inyectable: en tests no dependemos de la service-role de Supabase.
    const resolveEmails = async (ids) => Object.fromEntries(ids.map((id) => [id, `${id}@example.com`]));
    const listRes = createFakeRes();
    await membersHandler({
      method: 'GET',
      headers: ownerHeaders,
      query: { id: 'org-a' },
    }, listRes, prisma, { resolveEmails });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toHaveLength(2);
    expect(listRes.body).toContainEqual(expect.objectContaining({
      userId: 'member-1',
      email: 'member-1@example.com',
    }));

    const removeRes = createFakeRes();
    await removeMemberHandler({
      method: 'DELETE',
      headers: ownerHeaders,
      query: { id: 'org-a', userId: 'member-1' },
    }, removeRes, prisma);
    expect(removeRes.statusCode).toBe(204);
  });

  it('degrada a email null si el resolver falla, sin tumbar la lista de miembros', async () => {
    const prisma = fakePrisma();
    const resolveEmails = async () => { throw new Error('service-role caída'); };
    const listRes = createFakeRes();
    await membersHandler({
      method: 'GET',
      headers: ownerHeaders,
      query: { id: 'org-a' },
    }, listRes, prisma, { resolveEmails });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toHaveLength(2);
    expect(listRes.body.every((member) => member.email === null)).toBe(true);
  });

  it('lista solo invitaciones pendientes sin exponer hashes y permite revocarlas', async () => {
    const now = Date.now();
    const prisma = createFakePliegoPrisma([], {
      organizations: [{ id: 'org-a', name: 'Org A', slug: 'org-a', plan: 'trial' }],
      memberships: [{ userId: TEST_USER.id, organizationId: 'org-a', role: 'owner' }],
      invitations: [
        {
          id: 'pending',
          organizationId: 'org-a',
          email: 'pending@example.com',
          role: 'member',
          tokenHash: 'hash-pending',
          acceptedAt: null,
          expiresAt: new Date(now + 60_000),
          createdAt: new Date(now),
          createdBy: TEST_USER.id,
        },
        {
          id: 'accepted',
          organizationId: 'org-a',
          email: 'accepted@example.com',
          role: 'member',
          tokenHash: 'hash-accepted',
          acceptedAt: new Date(now),
          expiresAt: new Date(now + 60_000),
          createdAt: new Date(now),
          createdBy: TEST_USER.id,
        },
        {
          id: 'expired',
          organizationId: 'org-a',
          email: 'expired@example.com',
          role: 'owner',
          tokenHash: 'hash-expired',
          acceptedAt: null,
          expiresAt: new Date(now - 60_000),
          createdAt: new Date(now - 120_000),
          createdBy: TEST_USER.id,
        },
        {
          id: 'other-org',
          organizationId: 'org-b',
          email: 'private@other-org.example',
          role: 'owner',
          tokenHash: 'hash-other-org',
          acceptedAt: null,
          expiresAt: new Date(now + 60_000),
          createdAt: new Date(now),
          createdBy: 'other-owner',
        },
      ],
    });

    const listRes = createFakeRes();
    await invitationHandler({
      method: 'GET',
      headers: ownerHeaders,
      query: { id: 'org-a' },
    }, listRes, prisma);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body).toEqual([expect.objectContaining({
      id: 'pending',
      email: 'pending@example.com',
    })]);
    expect(listRes.body[0]).not.toHaveProperty('tokenHash');

    const revokeRes = createFakeRes();
    await revokeInvitationHandler({
      method: 'DELETE',
      headers: ownerHeaders,
      query: { id: 'org-a', invitationId: 'pending' },
    }, revokeRes, prisma);
    expect(revokeRes.statusCode).toBe(204);

    const repeatRes = createFakeRes();
    await revokeInvitationHandler({
      method: 'DELETE',
      headers: ownerHeaders,
      query: { id: 'org-a', invitationId: 'pending' },
    }, repeatRes, prisma);
    expect(repeatRes.statusCode).toBe(404);

    const crossTenantRes = createFakeRes();
    await revokeInvitationHandler({
      method: 'DELETE',
      headers: ownerHeaders,
      query: { id: 'org-a', invitationId: 'other-org' },
    }, crossTenantRes, prisma);
    expect(crossTenantRes.statusCode).toBe(404);
    expect(await prisma.invitation.findUnique({ where: { id: 'other-org' } })).not.toBeNull();
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

  it('valida métodos y bodies, y permite reenviar una invitación pendiente', async () => {
    const prisma = fakePrisma();
    const badMethod = createFakeRes();
    await invitationHandler({
      method: 'PATCH', headers: ownerHeaders, query: { id: 'org-a' },
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
    const resend = createFakeRes();
    await invitationHandler(request, resend, prisma, authInvite);
    expect(resend.statusCode).toBe(201);
    expect(authInvite.calls).toHaveLength(2);
    const rows = await prisma.invitation.findMany({ where: { organizationId: 'org-a' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashInvitationToken(
      new URL(authInvite.calls[1][1]).searchParams.get('invitation'),
    ));
    expect(rows[0].tokenHash).not.toBe(hashInvitationToken(
      new URL(authInvite.calls[0][1]).searchParams.get('invitation'),
    ));

    const oldToken = new URL(authInvite.calls[0][1]).searchParams.get('invitation');
    const oldAccept = createFakeRes();
    await acceptHandler({
      method: 'POST',
      headers: await authHeaders({ sub: 'invited-user', email: 'duplicate@example.com' }),
      body: { token: oldToken },
    }, oldAccept, prisma);
    expect(oldAccept.statusCode).toBe(400);

    const newToken = new URL(authInvite.calls[1][1]).searchParams.get('invitation');
    const newAccept = createFakeRes();
    await acceptHandler({
      method: 'POST',
      headers: await authHeaders({ sub: 'invited-user', email: 'duplicate@example.com' }),
      body: { token: newToken },
    }, newAccept, prisma);
    expect(newAccept.statusCode).toBe(200);
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

  it('restaura la invitación anterior si falla el correo de reenvío', async () => {
    const prisma = fakePrisma();
    const firstInvite = captureAuthInvite();
    const request = {
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'retry@example.com', role: 'member' },
    };
    await invitationHandler(request, createFakeRes(), prisma, firstInvite);
    const [before] = await prisma.invitation.findMany({ where: { organizationId: 'org-a' } });

    const failedResend = createFakeRes();
    await invitationHandler(request, failedResend, prisma, {
      env: { APP_URL: 'https://app.example.com' },
      inviteUser: async () => {
        const error = new Error('fallo de Supabase');
        error.code = 'AUTH_INVITE_FAILED';
        throw error;
      },
    });

    expect(failedResend.statusCode).toBe(502);
    const [restored] = await prisma.invitation.findMany({ where: { organizationId: 'org-a' } });
    expect(restored).toMatchObject({
      id: before.id,
      tokenHash: before.tokenHash,
      expiresAt: before.expiresAt,
      createdBy: before.createdBy,
    });
  });

  it('falla cerrado y no usa VERCEL_URL si falta una URL pública configurada', async () => {
    const prisma = fakePrisma();
    const res = createFakeRes();
    await invitationHandler({
      method: 'POST',
      headers: ownerHeaders,
      query: { id: 'org-a' },
      body: { email: 'new@example.com', role: 'member' },
    }, res, prisma, {
      env: { VERCEL_URL: 'deployment-efimero.vercel.app' },
      inviteUser: async () => {
        throw new Error('No debería intentar enviar sin URL.');
      },
    });

    expect(res.statusCode).toBe(503);
    expect(await prisma.invitation.findMany({ where: { organizationId: 'org-a' } })).toEqual([]);
  });

  it('valida el método al revocar invitaciones', async () => {
    const res = createFakeRes();
    await revokeInvitationHandler({
      method: 'GET',
      headers: ownerHeaders,
      query: { id: 'org-a', invitationId: 'inv-1' },
    }, res, fakePrisma());
    expect(res.statusCode).toBe(405);
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
