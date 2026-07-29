import { createHash, randomBytes } from 'node:crypto';
import { withTenant, withUser } from './tenantDb.js';

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
  return withUser(client, userId, async (tx) => {
    // Serializa nombres que producirían el mismo slug para que dos altas simultáneas
    // no pasen ambas el findUnique y una termine en P2002.
    const slugLock = slugifyOrganizationName(name);
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`org-slug:${slugLock}`}, 0))
    `;
    const slug = await availableSlug(tx, name);
    const organization = await tx.organization.create({
      data: { name, slug },
    });
    // La membership inicial ya es una operación tenant: fijamos el id recién creado
    // dentro de esta misma transacción antes de insertarla.
    await tx.$executeRaw`SELECT set_config('app.org_id', ${organization.id}, true)`;
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
  const invitationState = await withTenant(client, organizationId, async (tx) => {
    // El lock evita dos invitaciones pendientes si llegan dos requests concurrentes.
    await tx.$executeRaw`
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
  return withTenant(client, invitation.organizationId, async (tx) => {
    await tx.$executeRaw`
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

export async function listPendingInvitations(client, organizationId, { now = new Date() } = {}) {
  const invitations = await withTenant(client, organizationId, (db) => db.invitation.findMany({
    where: {
      organizationId,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  }));

  // Nunca exponer tokenHash: aunque no sea el token en claro, es material sensible
  // interno y el owner solo necesita los metadatos para gestionar la invitación.
  return invitations.map((invitation) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    createdBy: invitation.createdBy,
  }));
}

export async function revokePendingInvitation(
  client,
  { organizationId, invitationId },
  { now = new Date() } = {},
) {
  // deleteMany convierte comprobación+borrado en una única sentencia. Si la aceptación
  // concurrente gana el bloqueo de la fila, acceptedAt deja de ser null y no se borra.
  const result = await withTenant(client, organizationId, (db) => db.invitation.deleteMany({
    where: {
      id: invitationId,
      organizationId,
      acceptedAt: null,
      expiresAt: { gt: now },
    },
  }));
  if (result.count === 0) {
    const err = new Error('Invitación pendiente no encontrada.');
    err.code = 'INVITATION_NOT_FOUND';
    throw err;
  }
}

export async function listMembers(client, organizationId) {
  return withTenant(client, organizationId, (db) => db.membership.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
  }));
}

export async function removeMember(client, { organizationId, actorUserId, targetUserId }) {
  return withTenant(client, organizationId, async (tx) => {
    // Serializa las bajas de la misma organización para que dos owners no puedan
    // abandonar a la vez viendo ambos ownerCount=2 y dejar el tenant sin owner.
    //
    // Es un advisory lock y NO un `SELECT ... FOR UPDATE` sobre organizations: bloquear
    // esa fila exige privilegio UPDATE sobre la tabla, que a `app_tenant` se le retiró a
    // propósito (migración 20260728150000) porque ninguna ruta de runtime actualiza
    // organizaciones. Con el row lock, toda petición de quitar miembro moría con
    // "permission denied". El advisory lock da la misma exclusión mutua sin pedir
    // permisos de escritura, y muere con la transacción igual que el resto del contexto.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`org-members:${organizationId}`}, 0))
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
