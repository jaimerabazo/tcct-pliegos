// Utilidades de la suite de integración: cliente Prisma real + fixtures de tenancy.
//
// Principio de diseño (importante): estos tests NO hacen TRUNCATE ni borran nada que no
// hayan creado ellos. Cada corrida genera ids únicos con el prefijo `it-` y al terminar
// borra SOLO esas organizaciones (el `onDelete: Cascade` del schema arrastra memberships,
// pliegos, invitaciones, usage_events y audit_log).
//
// Por qué así y no con TRUNCATE: permite correr la suite contra el contenedor efímero de
// CI *y* contra una BD de desarrollo con datos, sin riesgo de barrer trabajo de nadie.
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../../src/generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

function prismaFor(connectionString, variable) {
  if (!connectionString) {
    throw new Error(
      `La suite de integración necesita ${variable} (Postgres real). `
      + 'En CI lo aporta el contenedor de servicio; en local, exporta el de tu BD de desarrollo.',
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Cliente de RUNTIME: el que usa la aplicación. En CI conecta con un rol que no puede
// eludir el RLS, así que está sujeto a las políticas igual que en producción.
export function createTestPrisma() {
  return prismaFor(process.env.DATABASE_URL, 'DATABASE_URL');
}

// Cliente OBSERVADOR: para montar fixtures y para comprobar qué hay REALMENTE en la tabla
// después de un intento de ataque.
//
// Es imprescindible que sea distinto del de runtime. Con el RLS activo, una verificación
// hecha desde el cliente de runtime no distingue "la fila sigue intacta" de "la fila
// existe pero no puedo verla": ambas devuelven null, y un test podría pasar por la razón
// equivocada. El observador ve la tabla entera y responde a la única pregunta que importa:
// ¿el atacante consiguió cambiar algo?
//
// En CI es el rol propietario (MIGRATION_DATABASE_URL); en local, la misma conexión de
// desarrollo, que ya tiene privilegios de propietario.
export function createAdminPrisma() {
  return prismaFor(
    process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL,
    'MIGRATION_DATABASE_URL o DATABASE_URL',
  );
}

// Prefijo común a todo lo que crea la suite: hace obvio en la BD qué filas son de tests
// y permite una limpieza de emergencia manual si una corrida se corta a medias.
const ID_PREFIX = 'it-';
export const testId = (label) => `${ID_PREFIX}${label}-${randomUUID()}`;

// Una organización con sus miembros y pliegos. Ids explícitos (no generados por la BD)
// para poder afirmar sobre ellos y limpiarlos sin releer. La transacción evita dejar una
// organización parcial si falla la creación de cualquier membership o pliego.
export async function createOrgFixture(prisma, { label, members = [], pliegos = [] }) {
  const organizationId = testId(label);
  return prisma.$transaction(async (tx) => {
    // Desde la fase 5b, `Pliego` tiene RLS: sin organización activa, un INSERT se rechaza
    // cuando el rol de conexión no puede eludir las políticas (así conecta el CI). Fijamos
    // el contexto para el andamiaje; el aislamiento se prueba en los tests, no aquí.
    await tx.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;

    await tx.organization.create({
      data: {
        id: organizationId,
        name: `Org ${label}`,
        slug: organizationId, // el slug es @unique: reutilizar el id evita colisiones
      },
    });

    for (const member of members) {
      await tx.membership.create({
        data: { userId: member.userId, organizationId, role: member.role ?? 'member' },
      });
    }

    const createdPliegos = [];
    for (const [index, pliego] of pliegos.entries()) {
      createdPliegos.push(await tx.pliego.create({
        data: {
          organizationId,
          expediente: pliego.expediente ?? `2026/${label}-${index}`,
          titulo: pliego.titulo ?? `Pliego ${label} ${index}`,
          organismo: pliego.organismo ?? 'Organismo de prueba',
          importe: pliego.importe ?? 1000000,
          lotes: pliego.lotes ?? 1,
          estado: pliego.estado ?? 'analizado',
          procedimiento: pliego.procedimiento ?? 'Abierto',
          ens: pliego.ens ?? 'Alto',
          analysisData: pliego.analysisData ?? null,
          createdBy: pliego.createdBy ?? members[0]?.userId ?? null,
        },
      }));
    }

    return { organizationId, pliegos: createdPliegos };
  });
}

// Borra las organizaciones creadas por la suite. La cascada del schema hace el resto:
// si esto dejara huérfanos, sería un fallo del propio modelo que conviene detectar.
export async function cleanupOrgs(prisma, organizationIds) {
  if (!organizationIds.length) return;
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
}
