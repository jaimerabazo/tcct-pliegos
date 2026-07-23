import { createHash, randomBytes } from 'node:crypto';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function slugifyOrganizationName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'organizacion';
}

export function hashInvitationToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function availableSlug(client, name) {
  const base = slugifyOrganizationName(name);
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    const existing = await client.organization.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  throw new Error('No se ha podido generar un identificador único para la organización.');
}

export async function createOrganization(client, { name, userId }) {
  return client.$transaction(async (tx) => {
    // Serializa nombres que producirían el mismo slug para que dos altas simultáneas
    // no pasen ambas el findUnique y una termine en P2002.
    const slugLock = slugifyOrganizationName(name);
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`org-slug:${slugLock}`}, 0))
    `;
    const slug = await availableSlug(tx, name);
    const organization = await tx.organization.create({
      data: { name, slug },
    });
    await tx.membership.create({
      data: { userId, organizationId: organization.id, role: 'owner' },
    });
    return { ...organization, role: 'owner' };
  });
}

export async function createInvitation(
  client,
  { organizationId, email, role, createdBy },
  { now = new Date(), token = randomBytes(32).toString('base64url') } = {},
) {
  const normalizedEmail = email.trim().toLowerCase();
  const invitation = await client.$transaction(async (tx) => {
    // El lock evita dos invitaciones pendientes si llegan dos requests concurrentes.
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`invitation:${organizationId}:${normalizedEmail}`}, 0)
      )
    `;
    const pending = await tx.invitation.findFirst({
      where: {
        organizationId,
        email: normalizedEmail,
        acceptedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (pending) {
      const err = new Error('Ya existe una invitación pendiente para este email.');
      err.code = 'INVITATION_EXISTS';
      throw err;
    }

    return tx.invitation.create({
      data: {
        organizationId,
        email: normalizedEmail,
        role,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        createdBy,
      },
    });
  });

  // El token en claro solo existe en esta respuesta. La BD conserva únicamente sha-256.
  return { invitation, token };
}

export async function listMembers(client, organizationId) {
  return client.membership.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function removeMember(client, { organizationId, actorUserId, targetUserId }) {
  return client.$transaction(async (tx) => {
    // Bloquea la organización para que dos owners no puedan abandonar a la vez viendo
    // ambos ownerCount=2 y dejar el tenant sin owner.
    await tx.$queryRaw`
      SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE
    `;
    const target = await tx.membership.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
    if (!target) {
      const err = new Error('Miembro no encontrado.');
      err.code = 'MEMBER_NOT_FOUND';
      throw err;
    }

    if (targetUserId === actorUserId && target.role === 'owner') {
      const ownerCount = await tx.membership.count({
        where: { organizationId, role: 'owner' },
      });
      if (ownerCount === 1) {
        const err = new Error('El último owner no puede abandonar la organización.');
        err.code = 'LAST_OWNER';
        throw err;
      }
    }

    await tx.membership.delete({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
    return target;
  });
}

export async function acceptInvitation(client, { token, userId, email }) {
  if (!email) {
    const err = new Error('La sesión no contiene un email verificable.');
    err.code = 'EMAIL_REQUIRED';
    throw err;
  }

  let rows;
  try {
    rows = await client.$queryRaw`
      SELECT *
        FROM accept_organization_invitation(
          ${hashInvitationToken(token)},
          ${userId},
          ${email.trim().toLowerCase()}
        )
    `;
  } catch (err) {
    // Prisma envuelve los RAISE EXCEPTION de PostgreSQL como P2010 y conserva el
    // SQLSTATE real en meta.code. Lo convertimos a un error de dominio estable.
    if (err?.code === 'P2010' && err?.meta?.code === 'P0001') {
      const dbMessage = String(err.meta.message || '');
      const safeMessage = [
        'La invitación no existe.',
        'La invitación ya fue aceptada.',
        'La invitación ha caducado.',
        'La invitación pertenece a otro email.',
        'La organización ya no está activa.',
      ].find((message) => dbMessage.includes(message)) || 'La invitación no es válida.';
      const invitationError = new Error(safeMessage);
      invitationError.code = 'INVITATION_INVALID';
      throw invitationError;
    }
    throw err;
  }
  if (!rows?.[0]) {
    const err = new Error('No se ha podido aceptar la invitación.');
    err.code = 'INVITATION_INVALID';
    throw err;
  }
  return rows[0];
}
