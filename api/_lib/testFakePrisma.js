// Doble en memoria de PrismaClient para tests de los handlers de /api/pliegos.
// Mismo espíritu que el doble de prisma/seed.test.js: implementa lo justo del
// cliente real (findMany, findUnique, update —lanzando P2025 si no existe, como
// Prisma de verdad—, create, upsert) para no depender de vi.mock ni de una BD real.
// Guardado internamente por `id`; `upsert` (que usa `where.expediente`) busca por
// ese campo, igual que hace Prisma de verdad con una columna @unique distinta de la PK.
//
// Desde el Bloque 3 el doble también modela el tenancy mínimo que consume
// requireMember (authz.js): `organizations` (por id) y `memberships` (por PK compuesta
// userId+organizationId, con `include: { organization }`).
let counter = 0;

export function createFakePliegoPrisma(seedRows = [], { organizations = [], memberships = [] } = {}) {
  const rows = new Map(seedRows.map((r) => [r.id, { ...r }]));
  const findByExpediente = (expediente) => [...rows.values()].find((r) => r.expediente === expediente);
  const orgs = new Map(organizations.map((o) => [o.id, { deletedAt: null, ...o }]));
  const members = new Map(
    memberships.map((m) => [`${m.userId}:${m.organizationId}`, { role: 'member', ...m }]),
  );

  return {
    organization: {
      async findUnique({ where }) {
        return orgs.get(where.id) ?? null;
      },
    },
    membership: {
      async findUnique({ where, include } = {}) {
        const { userId, organizationId } = where.userId_organizationId;
        const found = members.get(`${userId}:${organizationId}`);
        if (!found) return null;
        const result = { ...found };
        if (include?.organization) {
          result.organization = orgs.get(organizationId) ?? null;
        }
        return result;
      },
    },
    pliego: {
      async findMany({ orderBy } = {}) {
        const all = [...rows.values()];
        if (orderBy?.fechaAnalisis === 'desc') {
          all.sort((a, b) => b.fechaAnalisis - a.fechaAnalisis);
        }
        return all;
      },
      async findUnique({ where }) {
        return rows.get(where.id) ?? null;
      },
      async update({ where, data }) {
        const existing = rows.get(where.id);
        if (!existing) {
          const err = new Error('An operation failed because it depends on one or more records that were required but not found.');
          err.code = 'P2025';
          throw err;
        }
        const updated = { ...existing, ...data, updatedAt: new Date() };
        rows.set(where.id, updated);
        return updated;
      },
      async create({ data }) {
        const id = `test-id-${++counter}`;
        const row = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
        rows.set(id, row);
        return row;
      },
      async upsert({ where, update, create }) {
        const existing = findByExpediente(where.expediente);
        if (existing) {
          const updated = { ...existing, ...update, updatedAt: new Date() };
          rows.set(existing.id, updated);
          return updated;
        }
        const id = `test-id-${++counter}`;
        const row = { id, createdAt: new Date(), updatedAt: new Date(), ...create };
        rows.set(id, row);
        return row;
      },
    },
  };
}
