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

export function createTestPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'La suite de integración necesita DATABASE_URL (Postgres real). '
      + 'En CI lo aporta el contenedor de servicio; en local, exporta el de tu BD de desarrollo.',
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// Prefijo común a todo lo que crea la suite: hace obvio en la BD qué filas son de tests
// y permite una limpieza de emergencia manual si una corrida se corta a medias.
const ID_PREFIX = 'it-';
export const testId = (label) => `${ID_PREFIX}${label}-${randomUUID()}`;

// Una organización con sus miembros y pliegos. Ids explícitos (no generados por la BD)
// para poder afirmar sobre ellos y limpiarlos sin releer.
export async function createOrgFixture(prisma, { label, members = [], pliegos = [] }) {
  const organizationId = testId(label);
  await prisma.organization.create({
    data: {
      id: organizationId,
      name: `Org ${label}`,
      slug: organizationId, // el slug es @unique: reutilizar el id evita colisiones
    },
  });

  for (const member of members) {
    await prisma.membership.create({
      data: { userId: member.userId, organizationId, role: member.role ?? 'member' },
    });
  }

  const createdPliegos = [];
  for (const [index, pliego] of pliegos.entries()) {
    createdPliegos.push(await prisma.pliego.create({
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
}

// Borra las organizaciones creadas por la suite. La cascada del schema hace el resto:
// si esto dejara huérfanos, sería un fallo del propio modelo que conviene detectar.
export async function cleanupOrgs(prisma, organizationIds) {
  if (!organizationIds.length) return;
  await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
}
