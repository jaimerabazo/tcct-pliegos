// Doble en memoria de PrismaClient para tests de los handlers de /api/pliegos.
// Mismo espíritu que el doble de prisma/seed.test.js: implementa lo justo del
// cliente real (findMany, findUnique, update —lanzando P2025 si no existe, como
// Prisma de verdad—, create, upsert) para no depender de vi.mock ni de una BD real.
// Guardado internamente por `id`; `upsert` (que usa `where.expediente`) busca por
// ese campo, igual que hace Prisma de verdad con una columna @unique distinta de la PK.
let counter = 0;

export function createFakePliegoPrisma(seedRows = []) {
  const rows = new Map(seedRows.map((r) => [r.id, { ...r }]));
  const findByExpediente = (expediente) => [...rows.values()].find((r) => r.expediente === expediente);

  return {
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
