import { describe, it, expect } from 'vitest';
import {
  MOCK_PLIEGOS,
  MOCK_ANALYSIS,
  DEMO_ORG,
  toPliegoRow,
  seedOrganization,
  seedOwnerMembership,
  seedPliegos,
} from './seed.js';

// Doble en memoria de PrismaClient: implementa lo justo que usa el seed
// (`pliego.upsert`, `organization.upsert`, `membership.upsert`) más lecturas para
// verificar. Reproduce la semántica de idempotencia por clave única de cada modelo
// (`expediente`, `slug` y la PK compuesta userId+organizationId respectivamente).
function createFakePrisma() {
  const rows = new Map();
  const orgs = new Map();
  const memberships = new Map();
  let orgCounter = 0;
  return {
    pliego: {
      async upsert({ where, update, create }) {
        const key = where.expediente;
        if (rows.has(key)) {
          rows.set(key, { ...rows.get(key), ...update });
        } else {
          rows.set(key, { ...create });
        }
        return rows.get(key);
      },
      async findUnique({ where }) {
        return rows.get(where.expediente) ?? null;
      },
      async count() {
        return rows.size;
      },
    },
    organization: {
      async upsert({ where, update, create }) {
        const key = where.slug;
        if (orgs.has(key)) {
          orgs.set(key, { ...orgs.get(key), ...update });
        } else {
          orgs.set(key, { id: `org-${++orgCounter}`, ...create });
        }
        return orgs.get(key);
      },
      async count() {
        return orgs.size;
      },
    },
    membership: {
      async upsert({ where, update, create }) {
        const { userId, organizationId } = where.userId_organizationId;
        const key = `${userId}:${organizationId}`;
        if (memberships.has(key)) {
          memberships.set(key, { ...memberships.get(key), ...update });
        } else {
          memberships.set(key, { ...create });
        }
        return memberships.get(key);
      },
      async count() {
        return memberships.size;
      },
    },
  };
}

describe('toPliegoRow', () => {
  it('mapea los campos escalares tal cual', () => {
    const p = MOCK_PLIEGOS.find((x) => x.expediente === '2026/7008');
    const row = toPliegoRow(p);
    expect(row).toMatchObject({
      expediente: '2026/7008',
      titulo: p.titulo,
      organismo: p.organismo,
      importe: p.importe,
      lotes: p.lotes,
      estado: p.estado,
      procedimiento: p.procedimiento,
      ens: p.ens,
    });
  });

  it('convierte las fechas a Date', () => {
    const row = toPliegoRow(MOCK_PLIEGOS[0]);
    expect(row.fechaAnalisis).toBeInstanceOf(Date);
    expect(row.fechaLimite).toBeInstanceOf(Date);
  });

  it('adjunta analysisData cuando existe y null cuando no', () => {
    const con = toPliegoRow(MOCK_PLIEGOS.find((x) => x.id === '2026-7008'));
    expect(con.analysisData).toBe(MOCK_ANALYSIS['2026-7008']);

    const sin = toPliegoRow(MOCK_PLIEGOS.find((x) => x.id === '2026-4521'));
    expect(sin.analysisData).toBeNull();
  });

  it('adjunta el organizationId cuando se pasa y null si no (fase expand)', () => {
    expect(toPliegoRow(MOCK_PLIEGOS[0], 'org-42').organizationId).toBe('org-42');
    expect(toPliegoRow(MOCK_PLIEGOS[0]).organizationId).toBeNull();
  });
});

describe('seedOrganization', () => {
  it('crea la org demo con slug, nombre y plan', async () => {
    const prisma = createFakePrisma();
    const org = await seedOrganization(prisma);
    expect(org.slug).toBe(DEMO_ORG.slug);
    expect(org.name).toBe(DEMO_ORG.name);
    expect(org.plan).toBe(DEMO_ORG.plan);
    expect(org.id).toBeTruthy();
  });

  it('es idempotente por slug: dos corridas, una sola org con el mismo id', async () => {
    const prisma = createFakePrisma();
    const primera = await seedOrganization(prisma);
    const segunda = await seedOrganization(prisma);
    expect(await prisma.organization.count()).toBe(1);
    expect(segunda.id).toBe(primera.id);
  });
});

describe('seedOwnerMembership', () => {
  it('crea la membership de owner cuando hay userId', async () => {
    const prisma = createFakePrisma();
    const m = await seedOwnerMembership(prisma, 'org-1', 'user-abc');
    expect(m).toMatchObject({ userId: 'user-abc', organizationId: 'org-1', role: 'owner' });
  });

  it('sin userId no siembra nada y devuelve null', async () => {
    const prisma = createFakePrisma();
    expect(await seedOwnerMembership(prisma, 'org-1', undefined)).toBeNull();
    expect(await prisma.membership.count()).toBe(0);
  });

  it('es idempotente por (userId, organizationId)', async () => {
    const prisma = createFakePrisma();
    await seedOwnerMembership(prisma, 'org-1', 'user-abc');
    await seedOwnerMembership(prisma, 'org-1', 'user-abc');
    expect(await prisma.membership.count()).toBe(1);
  });
});

describe('seedPliegos', () => {
  it('inserta un pliego, lo lee de vuelta y conserva los campos', async () => {
    const prisma = createFakePrisma();
    const [uno] = MOCK_PLIEGOS;

    await seedPliegos(prisma, [uno]);

    const stored = await prisma.pliego.findUnique({ where: { expediente: uno.expediente } });
    expect(stored).not.toBeNull();
    expect(stored.expediente).toBe(uno.expediente);
    expect(stored.titulo).toBe(uno.titulo);
    expect(stored.organismo).toBe(uno.organismo);
    expect(stored.importe).toBe(uno.importe);
    expect(stored.lotes).toBe(uno.lotes);
    expect(stored.estado).toBe(uno.estado);
    expect(stored.procedimiento).toBe(uno.procedimiento);
    expect(stored.ens).toBe(uno.ens);
    expect(stored.fechaAnalisis).toBeInstanceOf(Date);
    expect(stored.analysisData).toEqual(MOCK_ANALYSIS[uno.id] ?? null);
  });

  it('siembra los 6 pliegos demo y devuelve el recuento', async () => {
    const prisma = createFakePrisma();
    const count = await seedPliegos(prisma);
    expect(count).toBe(MOCK_PLIEGOS.length);
    expect(await prisma.pliego.count()).toBe(MOCK_PLIEGOS.length);
  });

  it('es idempotente: correrlo dos veces no duplica filas', async () => {
    const prisma = createFakePrisma();
    await seedPliegos(prisma);
    await seedPliegos(prisma);
    expect(await prisma.pliego.count()).toBe(MOCK_PLIEGOS.length);
  });

  it('refresca las filas existentes al re-sembrar con datos distintos', async () => {
    const prisma = createFakePrisma();
    const [uno] = MOCK_PLIEGOS;

    await seedPliegos(prisma, [uno]);

    // Simula un cambio en los mocks de demo (título, importe, etc.).
    const editado = { ...uno, titulo: 'Título actualizado', importe: 99999999 };
    await seedPliegos(prisma, [editado]);

    const stored = await prisma.pliego.findUnique({ where: { expediente: uno.expediente } });
    expect(await prisma.pliego.count()).toBe(1);
    expect(stored.titulo).toBe('Título actualizado');
    expect(stored.importe).toBe(99999999);
  });

  it('cuelga los pliegos de la org y hace de backfill sobre filas pre-tenancy', async () => {
    const prisma = createFakePrisma();
    const [uno] = MOCK_PLIEGOS;

    // Fila sembrada ANTES de la migración expand (sin organizationId)...
    await seedPliegos(prisma, [uno]);
    let stored = await prisma.pliego.findUnique({ where: { expediente: uno.expediente } });
    expect(stored.organizationId).toBeNull();

    // ...re-sembrar con la org la adopta (backfill), sin duplicar.
    await seedPliegos(prisma, [uno], 'org-demo');
    stored = await prisma.pliego.findUnique({ where: { expediente: uno.expediente } });
    expect(await prisma.pliego.count()).toBe(1);
    expect(stored.organizationId).toBe('org-demo');
  });
});
