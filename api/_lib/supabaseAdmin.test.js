// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { inviteUserByEmail } from './supabaseAdmin.js';

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
