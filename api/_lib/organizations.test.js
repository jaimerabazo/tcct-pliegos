// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  acceptInvitation,
  createInvitation,
  createOrganization,
  hashInvitationToken,
  listMembers,
  removeMember,
  slugifyOrganizationName,
} from './organizations.js';
import { createFakePliegoPrisma } from './testFakePrisma.js';

describe('organizations domain', () => {
  it('genera slugs estables y resuelve colisiones', async () => {
    expect(slugifyOrganizationName('  ÁCME & Hijos, S.L.  ')).toBe('acme-hijos-s-l');
    const prisma = createFakePliegoPrisma([], {
      organizations: [{ id: 'existing', name: 'Acme', slug: 'acme' }],
    });
    const created = await createOrganization(prisma, { name: 'Acme', userId: 'owner-1' });
    expect(created).toMatchObject({ slug: 'acme-2', role: 'owner' });
    expect(await listMembers(prisma, created.id)).toContainEqual(expect.objectContaining({
      userId: 'owner-1',
      role: 'owner',
    }));
  });

  it('guarda solo el hash y hace caducar la invitación a los 7 días', async () => {
    const prisma = createFakePliegoPrisma();
    const now = new Date('2026-07-23T10:00:00Z');
    const { invitation, token } = await createInvitation(prisma, {
      organizationId: 'org-a',
      email: ' PERSONA@EXAMPLE.COM ',
      role: 'member',
      createdBy: 'owner-1',
    }, { now, token: 'token-secreto-de-prueba-con-mas-de-32-caracteres' });

    expect(invitation.email).toBe('persona@example.com');
    expect(invitation.tokenHash).toBe(hashInvitationToken(token));
    expect(invitation.tokenHash).not.toContain(token);
    expect(invitation.expiresAt).toEqual(new Date('2026-07-30T10:00:00Z'));
  });

  it('impide duplicar una invitación pendiente', async () => {
    const now = new Date('2026-07-23T10:00:00Z');
    const prisma = createFakePliegoPrisma([], {
      invitations: [{
        id: 'inv-1',
        organizationId: 'org-a',
        email: 'persona@example.com',
        acceptedAt: null,
        expiresAt: new Date('2026-07-24T10:00:00Z'),
      }],
    });
    await expect(createInvitation(prisma, {
      organizationId: 'org-a',
      email: 'persona@example.com',
      role: 'member',
      createdBy: 'owner-1',
    }, { now })).rejects.toMatchObject({ code: 'INVITATION_EXISTS' });
  });

  it('protege al último owner, pero permite quitarlo si existe otro', async () => {
    const oneOwner = createFakePliegoPrisma([], {
      memberships: [{ userId: 'owner-1', organizationId: 'org-a', role: 'owner' }],
    });
    await expect(removeMember(oneOwner, {
      organizationId: 'org-a',
      actorUserId: 'owner-1',
      targetUserId: 'owner-1',
    })).rejects.toMatchObject({ code: 'LAST_OWNER' });

    const twoOwners = createFakePliegoPrisma([], {
      memberships: [
        { userId: 'owner-1', organizationId: 'org-a', role: 'owner' },
        { userId: 'owner-2', organizationId: 'org-a', role: 'owner' },
      ],
    });
    await removeMember(twoOwners, {
      organizationId: 'org-a',
      actorUserId: 'owner-1',
      targetUserId: 'owner-1',
    });
    expect(await listMembers(twoOwners, 'org-a')).toHaveLength(1);
    await expect(removeMember(twoOwners, {
      organizationId: 'org-a',
      actorUserId: 'owner-2',
      targetUserId: 'missing',
    })).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
  });

  it('acepta token+email y devuelve la nueva membership', async () => {
    const token = 'token-secreto-de-prueba-con-mas-de-32-caracteres';
    const prisma = createFakePliegoPrisma([], {
      organizations: [{ id: 'org-a', name: 'Org A', slug: 'org-a', plan: 'trial' }],
      invitations: [{
        id: 'inv-1',
        organizationId: 'org-a',
        email: 'persona@example.com',
        role: 'member',
        tokenHash: hashInvitationToken(token),
        acceptedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }],
    });
    await expect(acceptInvitation(prisma, {
      token,
      userId: 'user-new',
      email: 'PERSONA@example.com',
    })).resolves.toMatchObject({ organizationId: 'org-a', role: 'member' });
    expect(await listMembers(prisma, 'org-a')).toContainEqual(expect.objectContaining({
      userId: 'user-new',
    }));
  });

  it('rechaza aceptación sin email o sin resultado de la función segura', async () => {
    await expect(acceptInvitation({}, {
      token: 'token-secreto-de-prueba-con-mas-de-32-caracteres',
      userId: 'user-new',
      email: null,
    })).rejects.toMatchObject({ code: 'EMAIL_REQUIRED' });

    await expect(acceptInvitation({ $queryRaw: async () => [] }, {
      token: 'token-secreto-de-prueba-con-mas-de-32-caracteres',
      userId: 'user-new',
      email: 'new@example.com',
    })).rejects.toMatchObject({ code: 'INVITATION_INVALID' });

    await expect(acceptInvitation({
      $queryRaw: async () => {
        const err = new Error('Raw query failed');
        err.code = 'P2010';
        err.meta = { code: 'P0001', message: 'ERROR: La invitación ha caducado.' };
        throw err;
      },
    }, {
      token: 'token-secreto-de-prueba-con-mas-de-32-caracteres',
      userId: 'user-new',
      email: 'new@example.com',
    })).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
      message: 'La invitación ha caducado.',
    });
  });
});
