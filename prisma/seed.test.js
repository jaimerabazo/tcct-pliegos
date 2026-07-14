import { describe, it, expect } from 'vitest';
import {
  MOCK_PLIEGOS,
  MOCK_ANALYSIS,
  toPliegoRow,
  seedPliegos,
} from './seed.js';

// Doble en memoria de PrismaClient: implementa lo justo que usa seedPliegos
// (`pliego.upsert`) más `findUnique`/`count` para poder leer los datos de vuelta.
// Reproduce la semántica de `@unique` sobre `expediente`: idempotente por clave.
function createFakePrisma() {
  const rows = new Map();
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
});
