// Doble en memoria de PrismaClient para tests de los handlers de /api/pliegos.
// Mismo espíritu que el doble de prisma/seed.test.js: implementa lo justo del
// cliente real (findMany, findUnique, update —lanzando P2025 si no existe, como
// Prisma de verdad—, create, upsert) para no depender de vi.mock ni de una BD real.
// Guardado internamente por `id`; la unicidad de negocio es el compuesto
// (organizationId, expediente), igual que en el schema de producción.
//
// Desde el Bloque 3 el doble también modela el tenancy mínimo que consume
// requireMember (authz.js): `organizations` (por id) y `memberships` (por PK compuesta
// userId+organizationId, con `include: { organization }`).
let counter = 0;

export function createFakePliegoPrisma(
  seedRows = [],
  { organizations = [], memberships = [], invitations = [] } = {},
) {
  const rows = new Map(seedRows.map((r) => [r.id, { ...r }]));
  const findByTenantExpediente = ({ organizationId, expediente }) => [...rows.values()]
    .find((r) => r.organizationId === organizationId && r.expediente === expediente);
  const orgs = new Map(organizations.map((o) => [o.id, { deletedAt: null, ...o }]));
  const members = new Map(
    memberships.map((m) => [`${m.userId}:${m.organizationId}`, { role: 'member', ...m }]),
  );
  const usageEvents = [];
  const invitationRows = new Map(invitations.map((i) => [i.id, { ...i }]));

  // Igualdad campo a campo contra un `where` plano — suficiente para las queries
  // scoped ({ id, organizationId }, { organizationId, expediente }) de los handlers.
  const matchesWhere = (row, where = {}) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === 'object' && 'gt' in value) {
        return row[key] > value.gt;
      }
      return (row[key] ?? null) === (value ?? null);
    });

  const client = {
    async $transaction(operation) {
      if (typeof operation === 'function') return operation(client);
      return Promise.all(operation);
    },
    async $executeRaw() {
      return 1;
    },
    async $queryRaw(_strings, tokenHash, userId, email) {
      const sql = Array.isArray(_strings) ? _strings.join('?') : String(_strings);
      if (sql.includes('FROM organizations')) {
        return [];
      }
      const invitation = [...invitationRows.values()].find((i) => i.tokenHash === tokenHash);
      if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
        const err = new Error(!invitation
          ? 'La invitación no existe.'
          : invitation.acceptedAt
            ? 'La invitación ya fue aceptada.'
            : 'La invitación ha caducado.');
        err.code = 'P0001';
        throw err;
      }
      if (invitation.email.toLowerCase() !== email.toLowerCase()) {
        const err = new Error('La invitación pertenece a otro email.');
        err.code = 'P0001';
        throw err;
      }
      const organization = orgs.get(invitation.organizationId);
      if (!organization || organization.deletedAt) {
        const err = new Error('La organización ya no está activa.');
        err.code = 'P0001';
        throw err;
      }
      const memberKey = `${userId}:${invitation.organizationId}`;
      if (!members.has(memberKey)) {
        members.set(memberKey, {
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role,
          createdAt: new Date(),
        });
      } else if (members.get(memberKey).role !== 'owner') {
        members.get(memberKey).role = invitation.role;
      }
      invitation.acceptedAt = new Date();
      return [{
        organizationId: organization.id,
        name: organization.name,
        slug: organization.slug,
        plan: organization.plan,
        role: members.get(memberKey).role,
      }];
    },
    organization: {
      async findUnique({ where }) {
        if (where.id) return orgs.get(where.id) ?? null;
        if (where.slug) return [...orgs.values()].find((o) => o.slug === where.slug) ?? null;
        return null;
      },
      async create({ data }) {
        const id = `org-test-${++counter}`;
        const row = {
          id,
          plan: 'trial',
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        orgs.set(id, row);
        return row;
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
      async findMany({ where, include } = {}) {
        return [...members.values()]
          .filter((m) => matchesWhere(m, where))
          .map((m) => (include?.organization
            ? { ...m, organization: orgs.get(m.organizationId) ?? null }
            : { ...m }));
      },
      async create({ data }) {
        const row = { role: 'member', createdAt: new Date(), ...data };
        members.set(`${row.userId}:${row.organizationId}`, row);
        return row;
      },
      async count({ where } = {}) {
        return [...members.values()].filter((m) => matchesWhere(m, where)).length;
      },
      async delete({ where }) {
        const { userId, organizationId } = where.userId_organizationId;
        const key = `${userId}:${organizationId}`;
        const existing = members.get(key);
        if (!existing) {
          const err = new Error('Record not found.');
          err.code = 'P2025';
          throw err;
        }
        members.delete(key);
        return existing;
      },
    },
    invitation: {
      async findUnique({ where }) {
        return invitationRows.get(where.id) ?? null;
      },
      async findFirst({ where } = {}) {
        return [...invitationRows.values()].find((i) => matchesWhere(i, where)) ?? null;
      },
      async create({ data }) {
        const id = `invitation-${++counter}`;
        const row = { id, acceptedAt: null, createdAt: new Date(), ...data };
        invitationRows.set(id, row);
        return row;
      },
      async update({ where, data }) {
        const existing = invitationRows.get(where.id);
        if (!existing) {
          const err = new Error('Record not found.');
          err.code = 'P2025';
          throw err;
        }
        const updated = { ...existing, ...data };
        invitationRows.set(where.id, updated);
        return updated;
      },
      async findMany({ where } = {}) {
        return [...invitationRows.values()].filter((i) => matchesWhere(i, where));
      },
      async deleteMany({ where } = {}) {
        const matching = [...invitationRows.entries()]
          .filter(([, invitation]) => matchesWhere(invitation, where));
        matching.forEach(([id]) => invitationRows.delete(id));
        return { count: matching.length };
      },
      async delete({ where }) {
        const existing = invitationRows.get(where.id);
        if (!existing) {
          const err = new Error('Record not found.');
          err.code = 'P2025';
          throw err;
        }
        invitationRows.delete(where.id);
        return existing;
      },
    },
    usageEvent: {
      async create({ data }) {
        const row = { id: `usage-${usageEvents.length + 1}`, createdAt: new Date(), ...data };
        usageEvents.push(row);
        return row;
      },
      async findMany({ where } = {}) {
        return usageEvents.filter((e) => matchesWhere(e, where));
      },
    },
    pliego: {
      async findMany({ where, orderBy } = {}) {
        const all = [...rows.values()].filter((r) => matchesWhere(r, where));
        if (orderBy?.fechaAnalisis === 'desc') {
          all.sort((a, b) => b.fechaAnalisis - a.fechaAnalisis);
        }
        return all;
      },
      async findUnique({ where }) {
        return rows.get(where.id) ?? null;
      },
      async findFirst({ where } = {}) {
        return [...rows.values()].find((r) => matchesWhere(r, where)) ?? null;
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
        if (findByTenantExpediente(data)) {
          const err = new Error('Unique constraint failed on (organizationId, expediente).');
          err.code = 'P2002';
          throw err;
        }
        const id = `test-id-${++counter}`;
        const row = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
        rows.set(id, row);
        return row;
      },
      async upsert({ where, update, create }) {
        const existing = findByTenantExpediente(where.organizationId_expediente);
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
  return client;
}
