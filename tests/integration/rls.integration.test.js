// La CAPA 3 del aislamiento: Row-Level Security (fase 5b).
//
// La suite hermana (isolation.integration.test.js) comprueba que los *handlers* aíslan
// correctamente. Ésta comprueba lo contrario: qué pasa cuando el código NO filtra. Aquí
// se escriben queries deliberadamente inseguras —sin `where organizationId`, apuntando a
// filas de otro tenant— y se exige que Postgres las bloquee igualmente.
//
// Es la diferencia entre "confío en no tener bugs" y "aunque tenga un bug, no hay fuga".
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenant, APP_TENANT_ROLE } from '../../api/_lib/tenantDb.js';
import { createOrgFixture, createTestPrisma, cleanupOrgs } from './helpers/testDb.js';

const prisma = createTestPrisma();

let orgA;
let orgB;

beforeAll(async () => {
  orgA = await createOrgFixture(prisma, {
    label: 'rls-a',
    members: [{ userId: 'rls-user-a', role: 'owner' }],
    pliegos: [{ titulo: 'Confidencial de A' }, { titulo: 'Otro de A' }],
  });
  orgB = await createOrgFixture(prisma, {
    label: 'rls-b',
    members: [{ userId: 'rls-user-b', role: 'owner' }],
    pliegos: [{ titulo: 'Confidencial de B' }],
  });
});

afterAll(async () => {
  await cleanupOrgs(prisma, [orgA?.organizationId, orgB?.organizationId].filter(Boolean));
  await prisma.$disconnect();
});

describe('RLS: el motor filtra aunque el código no lo haga', () => {
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

    const enB = await prisma.pliego.count({ where: { organizationId: orgB.organizationId } });
    expect(enB).toBe(1); // sigue teniendo solo el suyo
  });

  it('un UPDATE dirigido a una fila de otro tenant no afecta a ninguna fila', async () => {
    const objetivo = orgB.pliegos[0];

    await withTenant(prisma, orgA.organizationId, (db) => db.pliego.updateMany({
      where: { id: objetivo.id }, // sin organizationId: solo el RLS lo detiene
      data: { titulo: 'SECUESTRADO' },
    }));

    const enBd = await prisma.pliego.findUnique({ where: { id: objetivo.id } });
    expect(enBd.titulo).toBe(objetivo.titulo);
  });

  it('un DELETE dirigido a una fila de otro tenant no borra nada', async () => {
    const objetivo = orgB.pliegos[0];

    await withTenant(prisma, orgA.organizationId, (db) => db.pliego.deleteMany({
      where: { id: objetivo.id },
    }));

    expect(await prisma.pliego.findUnique({ where: { id: objetivo.id } })).not.toBeNull();
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

    const intacta = await prisma.auditEntry.findUnique({ where: { id: creado.id } });
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
