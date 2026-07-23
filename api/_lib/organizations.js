import { createHash, randomBytes } from 'node:crypto';

// Debe mantenerse alineado con Authentication > Email OTP Expiration en Supabase.
const INVITATION_TTL_MS = 60 * 60 * 1000;

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
  const invitationState = await client.$transaction(async (tx) => {
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
    const data = {
      role,
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      createdBy,
    };

    // Reenviar invalida el token interno anterior y reinicia la misma hora de
    // validez que ofrece el enlace de Supabase.
    if (pending) {
      const invitation = await tx.invitation.update({
        where: { id: pending.id },
        data,
      });
      return { invitation, previousInvitation: pending };
    }

    const invitation = await tx.invitation.create({
      data: {
        organizationId,
        email: normalizedEmail,
        ...data,
      },
    });
    return { invitation, previousInvitation: null };
  });

  // El token en claro solo existe en esta respuesta. La BD conserva únicamente sha-256.
  return { ...invitationState, token };
}

export async function rollbackInvitation(client, { invitation, previousInvitation }) {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`invitation:${invitation.organizationId}:${invitation.email}`}, 0)
      )
    `;
    const current = await tx.invitation.findUnique({ where: { id: invitation.id } });

    // Otro reenvío pudo rotar la misma fila mientras fallaba la llamada a Auth.
    // En ese caso no debemos deshacer el token más reciente.
    if (!current || current.tokenHash !== invitation.tokenHash) return;

    if (previousInvitation) {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          role: previousInvitation.role,
          tokenHash: previousInvitation.tokenHash,
          expiresAt: previousInvitation.expiresAt,
          createdBy: previousInvitation.createdBy,
        },
      });
      return;
    }

    await tx.invitation.delete({ where: { id: invitation.id } });
  });
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

    if (target.role === 'owner') {
      const ownerCount = await tx.membership.count({
        where: { organizationId, role: 'owner' },
      });
      if (ownerCount === 1) {
        const err = new Error('No se puede eliminar al último owner de la organización.');
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
    // error original dentro del DriverAdapterError. Conservamos también la forma
    // antigua para no acoplar el dominio a una única versión de Prisma.
    const driverCause = err?.meta?.driverAdapterError?.cause;
    const sqlStates = [driverCause?.code, driverCause?.originalCode, err?.meta?.code];
    if (err?.code === 'P2010' && sqlStates.includes('P0001')) {
      const dbMessage = [
        driverCause?.message,
        driverCause?.originalMessage,
        err?.meta?.message,
        err?.message,
      ].filter((message) => typeof message === 'string').join('\n');
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
