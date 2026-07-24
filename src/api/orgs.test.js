import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvitation,
  createInvitation,
  createOrganization,
  listPendingInvitations,
  listMembers,
  listMyOrgs,
  removeMember,
  revokeInvitation,
} from './orgs.js';

describe('cliente API de organizaciones', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('cubre el flujo de onboarding e invitaciones', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'org-a', role: 'owner' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'secret' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ organizationId: 'org-a' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ userId: 'user-1' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    expect(await listMyOrgs()).toEqual([]);
    expect(await createOrganization('Acme')).toMatchObject({ id: 'org-a' });
    expect(await createInvitation('org-a', { email: 'new@example.com' })).toEqual({ token: 'secret' });
    expect(await acceptInvitation('secret')).toMatchObject({ organizationId: 'org-a' });
    expect(await listMembers('org-a')).toHaveLength(1);
    await expect(removeMember('org-a', 'user/1')).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ name: 'Acme' }),
    });
    expect(fetchMock.mock.calls[5][0]).toContain('user%2F1');
  });

  it('propaga errores al quitar miembros', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Último owner.' }), { status: 409 }),
    );
    await expect(removeMember('org-a', 'owner')).rejects.toThrow('Último owner.');
  });

  it('lista y revoca invitaciones pendientes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'inv/1' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    expect(await listPendingInvitations('org-a')).toEqual([{ id: 'inv/1' }]);
    await expect(revokeInvitation('org-a', 'inv/1')).resolves.toBeUndefined();

    expect(fetchMock.mock.calls[0][0]).toContain('/api/orgs/org-a/invitations');
    expect(fetchMock.mock.calls[1][0]).toContain('inv%2F1');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });
});
