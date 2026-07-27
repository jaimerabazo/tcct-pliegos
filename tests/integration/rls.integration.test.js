// La CAPA 3 del aislamiento: Row-Level Security (fase 5b).
//
// La suite hermana (isolation.integration.test.js) comprueba que los *handlers* aíslan
// correctamente. Ésta comprueba lo contrario: qué pasa cuando el código NO filtra. Aquí
// se escriben queries deliberadamente inseguras —sin `where organizationId`, apuntando a
// filas de otro tenant— y se exige que Postgres las bloquee igualmente.
//
// Es la diferencia entre "confío en no tener bugs" y "aunque tenga un bug, no hay fuga".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant, withUser, APP_TENANT_ROLE } from '../../api/_lib/tenantDb.js';
import { acceptInvitation, hashInvitationToken } from '../../api/_lib/organizations.js';
import { createAdminPrisma, createOrgFixture, createTestPrisma, cleanupOrgs } from './helpers/testDb.js';

// `prisma` = cliente de runtime, sujeto a RLS (es el que ejecuta los "ataques").
// `admin`  = observador con visión completa de la tabla. Sin él, comprobar el resultado
// de un ataque desde el cliente de runtime daría null tanto si la fila sobrevivió intacta
// como si desapareció: el test pasaría sin demostrar nada.
const prisma = createTestPrisma();
const admin = createAdminPrisma();

let orgA;
let orgB;

beforeAll(async () => {
  orgA = await createOrgFixture(admin, {
    label: 'rls-a',
    members: [{ userId: 'rls-user-a', role: 'owner' }],
    pliegos: [{ titulo: 'Confidencial de A' }, { titulo: 'Otro de A' }],
  });
  orgB = await createOrgFixture(admin, {
    label: 'rls-b',
    members: [{ userId: 'rls-user-b', role: 'owner' }],
    pliegos: [{ titulo: 'Confidencial de B' }],
  });
});

afterAll(async () => {
  await cleanupOrgs(admin, [orgA?.organizationId, orgB?.organizationId].filter(Boolean));
  await Promise.all([prisma.$disconnect(), admin.$disconnect()]);
});

describe('RLS: el motor filtra aunque el código no lo haga', () => {
  it('organizationId es obligatorio también para escrituras que puedan eludir RLS', async () => {
    const [column] = await admin.$queryRaw`
      SELECT is_nullable AS "isNullable"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Pliego'
        AND column_name = 'organizationId'
    `;

    expect(column?.isNullable).toBe('NO');
  });

  it('una consulta SIN filtro de organización solo devuelve filas del tenant activo', async () => {
    // Esta query es el bug que tememos: alguien escribe findMany() y olvida el where.
    const vistosDesdeA = await withTenant(prisma, orgA.organizationId, (db) => db.pliego.findMany());
    const ids = vistosDesdeA.map((pliego) => pliego.id);

    expect(ids).toEqual(expect.arrayContaining(orgA.pliegos.map((pliego) => pliego.id)));
    expect(ids).not.toContain(orgB.pliegos[0].id);
  });

  it('un findUnique por id de otro tenant no devuelve la fila', async () => {
    // `findUnique({ where: { id } })` sin organizationId: la Capa 2 fallando por completo.
    const ajeno = await withTenant(prisma, orgA.organizationId, (db) => db.pliego.findUnique({
      where: { id: orgB.pliegos[0].id },
    }));

    expect(ajeno).toBeNull();
  });

  it('escribir una fila en la organización de otro tenant es rechazado por la BD', async () => {
    await expect(withTenant(prisma, orgA.organizationId, (db) => db.pliego.create({
      data: {
        organizationId: orgB.organizationId, // ← intento de plantar datos en el tenant ajeno
        expediente: `2026/INTRUSO-${Date.now()}`,
        titulo: 'Fila inyectada',
        organismo: 'Organismo',
        lotes: 1,
        estado: 'analizado',
        procedimiento: 'Abierto',
        ens: 'Alto',
      },
    }))).rejects.toThrow();

    const enB = await admin.pliego.count({ where: { organizationId: orgB.organizationId } });
    expect(enB).toBe(1); // sigue teniendo solo el suyo
  });

  it('un UPDATE dirigido a una fila de otro tenant no afecta a ninguna fila', async () => {
    const objetivo = orgB.pliegos[0];

    await withTenant(prisma, orgA.organizationId, (db) => db.pliego.updateMany({
      where: { id: objetivo.id }, // sin organizationId: solo el RLS lo detiene
      data: { titulo: 'SECUESTRADO' },
    }));

    const enBd = await admin.pliego.findUnique({ where: { id: objetivo.id } });
    expect(enBd.titulo).toBe(objetivo.titulo);
  });

  it('un DELETE dirigido a una fila de otro tenant no borra nada', async () => {
    const objetivo = orgB.pliegos[0];

    await withTenant(prisma, orgA.organizationId, (db) => db.pliego.deleteMany({
      where: { id: objetivo.id },
    }));

    expect(await admin.pliego.findUnique({ where: { id: objetivo.id } })).not.toBeNull();
  });

  it('sin organización en el contexto no se ve NADA (fail-closed)', async () => {
    // Se asume el rol de runtime pero se omite a propósito fijar app.org_id: es el caso
    // de un cliente mal inicializado. `current_setting(..., true)` devuelve NULL y la
    // comparación nunca es cierta, así que el resultado seguro es "cero filas", no "todas".
    const [, visibles] = await prisma.$transaction([
      prisma.$executeRawUnsafe(`SET LOCAL ROLE ${APP_TENANT_ROLE}`),
      prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Pliego"`),
    ]);

    expect(visibles[0].n).toBe(0);
  });

  it('withTenant sin organizationId falla en voz alta en vez de degradar en silencio', async () => {
    await expect(withTenant(prisma, null, async () => 'no debería ejecutarse'))
      .rejects.toThrow(/organizationId/);
  });

  it('el contexto no sobrevive a la transacción (crítico con el pooler de conexiones)', async () => {
    await withTenant(prisma, orgA.organizationId, (db) => db.pliego.count());

    // Si SET LOCAL ROLE o set_config se filtrasen, la siguiente petición —que puede ser
    // de OTRO tenant sobre la misma conexión física— heredaría este contexto.
    const [estado] = await prisma.$queryRawUnsafe(
      `SELECT current_user AS rol, current_setting('app.org_id', true) AS org`,
    );
    expect(estado.rol).not.toBe(APP_TENANT_ROLE);
    // Al revertirse el SET LOCAL, Postgres no deja la variable en NULL sino en cadena
    // vacía (su valor de sesión). Da igual cuál de los dos sea: lo que no puede pasar es
    // que conserve la organización anterior, porque "" tampoco casa con ningún tenant.
    expect(estado.org ?? '').toBe('');
    expect(estado.org).not.toBe(orgA.organizationId);
  });
});

describe('RLS: memberships e invitations', () => {
  it('el bootstrap de usuario solo ve sus propias memberships', async () => {
    const propias = await withUser(prisma, 'rls-user-a', (db) => db.membership.findMany());

    expect(propias).toEqual([
      expect.objectContaining({ userId: 'rls-user-a', organizationId: orgA.organizationId }),
    ]);
  });

  it('un tenant no puede leer ni modificar memberships de otro', async () => {
    const desdeA = await withTenant(prisma, orgA.organizationId, (db) => db.membership.findMany());
    expect(desdeA.every((membership) => membership.organizationId === orgA.organizationId)).toBe(true);

    const borrado = await withTenant(prisma, orgA.organizationId, (db) => db.membership.deleteMany({
      where: { organizationId: orgB.organizationId },
    }));
    expect(borrado.count).toBe(0);
    expect(await admin.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: 'rls-user-b',
          organizationId: orgB.organizationId,
        },
      },
    })).not.toBeNull();
  });

  it('un tenant no puede leer ni modificar invitaciones de otro', async () => {
    const invitationA = await withTenant(prisma, orgA.organizationId, (db) => db.invitation.create({
      data: {
        organizationId: orgA.organizationId,
        email: 'rls-invite-a@example.com',
        role: 'member',
        tokenHash: hashInvitationToken('rls-token-a'),
        expiresAt: new Date(Date.now() + 60_000),
        createdBy: 'rls-user-a',
      },
    }));
    const invitationB = await withTenant(prisma, orgB.organizationId, (db) => db.invitation.create({
      data: {
        organizationId: orgB.organizationId,
        email: 'rls-invite-b@example.com',
        role: 'member',
        tokenHash: hashInvitationToken('rls-token-b'),
        expiresAt: new Date(Date.now() + 60_000),
        createdBy: 'rls-user-b',
      },
    }));

    const desdeA = await withTenant(prisma, orgA.organizationId, (db) => db.invitation.findMany());
    expect(desdeA.map((invitation) => invitation.id)).toContain(invitationA.id);
    expect(desdeA.map((invitation) => invitation.id)).not.toContain(invitationB.id);

    const alteradas = await withTenant(prisma, orgA.organizationId, (db) => db.invitation.updateMany({
      where: { id: invitationB.id },
      data: { email: 'robada@example.com' },
    }));
    expect(alteradas.count).toBe(0);
    expect(await admin.invitation.findUnique({ where: { id: invitationB.id } }))
      .toMatchObject({ email: 'rls-invite-b@example.com' });
  });

  it('aceptar por token sigue funcionando únicamente mediante SECURITY DEFINER', async () => {
    const token = `rls-accept-token-${Date.now()}`;
    const userId = `rls-invited-${Date.now()}`;
    await admin.invitation.create({
      data: {
        organizationId: orgA.organizationId,
        email: 'rls-accepted@example.com',
        role: 'member',
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 60_000),
        createdBy: 'rls-user-a',
      },
    });

    await expect(acceptInvitation(prisma, {
      token,
      userId,
      email: 'rls-accepted@example.com',
    })).resolves.toMatchObject({ organizationId: orgA.organizationId, role: 'member' });

    expect(await admin.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgA.organizationId } },
    })).not.toBeNull();
  });
});

describe('RLS: metering y auditoría son append-only', () => {
  it('se pueden insertar y leer eventos de la propia organización', async () => {
    const creado = await withTenant(prisma, orgA.organizationId, (db) => db.auditEntry.create({
      data: {
        organizationId: orgA.organizationId,
        userId: 'rls-user-a',
        action: 'pliego.update',
        entityType: 'pliego',
        entityId: orgA.pliegos[0].id,
      },
    }));

    const leidos = await withTenant(prisma, orgA.organizationId, (db) => db.auditEntry.findMany({
      where: { organizationId: orgA.organizationId },
    }));
    expect(leidos.map((entrada) => entrada.id)).toContain(creado.id);
  });

  it('modificar una entrada de auditoría es imposible (un registro editable no es auditoría)', async () => {
    const creado = await withTenant(prisma, orgA.organizationId, (db) => db.auditEntry.create({
      data: {
        organizationId: orgA.organizationId,
        userId: 'rls-user-a',
        action: 'pliego.delete',
        entityType: 'pliego',
        entityId: 'x',
      },
    }));

    // Un `update` puntual falla ruidosamente: sin política de UPDATE la fila es
    // inalcanzable y Prisma lo traduce a "registro no encontrado".
    await expect(withTenant(prisma, orgA.organizationId, (db) => db.auditEntry.update({
      where: { id: creado.id },
      data: { action: 'accion.falsificada' },
    }))).rejects.toThrow();

    // Un borrado masivo, en cambio, NO lanza: Postgres simplemente no ve ninguna fila que
    // borrar y responde "0 afectadas". La protección es la misma —nada se modifica—, pero
    // el síntoma es distinto, así que se afirma sobre el efecto, no sobre la excepción.
    const borrado = await withTenant(prisma, orgA.organizationId, (db) => db.auditEntry.deleteMany({
      where: { id: creado.id },
    }));
    expect(borrado.count).toBe(0);

    const intacta = await admin.auditEntry.findUnique({ where: { id: creado.id } });
    expect(intacta.action).toBe('pliego.delete');
  });

  it('los eventos de metering tampoco se pueden alterar', async () => {
    const evento = await withTenant(prisma, orgA.organizationId, (db) => db.usageEvent.create({
      data: {
        organizationId: orgA.organizationId,
        userId: 'rls-user-a',
        type: 'analyze',
        tokensIn: 100,
        tokensOut: 50,
      },
    }));

    await expect(withTenant(prisma, orgA.organizationId, (db) => db.usageEvent.update({
      where: { id: evento.id },
      data: { tokensIn: 0 }, // "no he gastado nada": justo lo que el append-only impide
    }))).rejects.toThrow();
  });

  it('un tenant no ve los eventos de otro', async () => {
    await withTenant(prisma, orgB.organizationId, (db) => db.usageEvent.create({
      data: {
        organizationId: orgB.organizationId,
        userId: 'rls-user-b',
        type: 'analyze',
        tokensIn: 999,
        tokensOut: 999,
      },
    }));

    const desdeA = await withTenant(prisma, orgA.organizationId, (db) => db.usageEvent.findMany());
    expect(desdeA.every((evento) => evento.organizationId === orgA.organizationId)).toBe(true);
  });
});
