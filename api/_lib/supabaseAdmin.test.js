// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { getUserEmails, inviteUserByEmail } from './supabaseAdmin.js';

function authClient({ inviteResult, magicLinkResult = { data: {}, error: null } }) {
  return {
    auth: {
      admin: {
        inviteUserByEmail: vi.fn().mockResolvedValue(inviteResult),
      },
      signInWithOtp: vi.fn().mockResolvedValue(magicLinkResult),
    },
  };
}

describe('inviteUserByEmail', () => {
  it('provisiona con una invitación de Auth los emails nuevos', async () => {
    const user = { id: 'new-user', email: 'new@example.com' };
    const client = authClient({ inviteResult: { data: { user }, error: null } });

    await expect(inviteUserByEmail(
      'new@example.com',
      'https://app.example.com/?invitation=token',
      { client },
    )).resolves.toBe(user);

    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each(['email_exists', 'user_already_exists'])(
    'envía un magic link a un usuario existente cuando Supabase responde %s',
    async (code) => {
      const client = authClient({
        inviteResult: {
          data: { user: null },
          error: { code, status: 422, message: 'User already registered' },
        },
      });
      const redirectTo = 'https://app.example.com/?invitation=token';

      await expect(inviteUserByEmail(
        'existing@example.com',
        redirectTo,
        { client },
      )).resolves.toBeNull();

      expect(client.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'existing@example.com',
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectTo,
        },
      });
    },
  );

  it('no confunde otros errores de Auth con un usuario existente', async () => {
    const cause = { code: 'over_email_send_rate_limit', status: 429 };
    const client = authClient({
      inviteResult: { data: { user: null }, error: cause },
    });

    await expect(inviteUserByEmail(
      'new@example.com',
      'https://app.example.com/',
      { client },
    )).rejects.toMatchObject({
      code: 'AUTH_INVITE_FAILED',
      cause,
    });
    expect(client.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('propaga como fallo de envío un error al mandar el magic link', async () => {
    const cause = { code: 'email_address_not_authorized', status: 403 };
    const client = authClient({
      inviteResult: {
        data: { user: null },
        error: { code: 'email_exists', status: 422 },
      },
      magicLinkResult: { data: {}, error: cause },
    });

    await expect(inviteUserByEmail(
      'existing@example.com',
      'https://app.example.com/',
      { client },
    )).rejects.toMatchObject({
      code: 'AUTH_INVITE_FAILED',
      cause,
    });
  });
});

function adminWith(usersById) {
  return {
    auth: {
      admin: {
        getUserById: vi.fn(async (id) => (
          id in usersById ? usersById[id] : { data: { user: null }, error: { message: 'not found' } }
        )),
      },
    },
  };
}

describe('getUserEmails', () => {
  it('resuelve los emails de los userIds pedidos', async () => {
    const client = adminWith({
      'u-1': { data: { user: { id: 'u-1', email: 'uno@example.com' } }, error: null },
      'u-2': { data: { user: { id: 'u-2', email: 'dos@example.com' } }, error: null },
    });
    await expect(getUserEmails(['u-1', 'u-2'], { client })).resolves.toEqual({
      'u-1': 'uno@example.com',
      'u-2': 'dos@example.com',
    });
  });

  it('devuelve null para un usuario que ya no existe (sin tumbar el resto)', async () => {
    const client = adminWith({
      'u-1': { data: { user: { id: 'u-1', email: 'uno@example.com' } }, error: null },
    });
    await expect(getUserEmails(['u-1', 'u-borrado'], { client })).resolves.toEqual({
      'u-1': 'uno@example.com',
      'u-borrado': null,
    });
  });

  it('tolera una excepción puntual del Admin API por usuario', async () => {
    const client = {
      auth: { admin: { getUserById: vi.fn(async () => { throw new Error('boom'); }) } },
    };
    await expect(getUserEmails(['u-1'], { client })).resolves.toEqual({ 'u-1': null });
  });

  it('degrada a null (no lanza) si falta la service-role', async () => {
    await expect(getUserEmails(['u-1', 'u-2'], { env: {} })).resolves.toEqual({
      'u-1': null,
      'u-2': null,
    });
  });

  it('devuelve un mapa vacío sin userIds (no llama al Admin API)', async () => {
    const client = adminWith({});
    await expect(getUserEmails([], { client })).resolves.toEqual({});
    expect(client.auth.admin.getUserById).not.toHaveBeenCalled();
  });
});
