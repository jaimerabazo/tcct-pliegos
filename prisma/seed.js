// Semilla de datos demo — los 6 expedientes de la etapa mockup, ahora colgados de una
// organización demo (Bloque 3: multi-tenancy). Idempotente (upsert por `slug`/`expediente`):
// se puede correr varias veces sin duplicar. La adopción de TODAS las filas pre-tenancy
// pertenece a la migración 20260722123000; el seed solo refresca sus expedientes demo.
import { pathToFileURL } from 'node:url';
import { parseShortDate } from '../src/logic.js';

// La org demo a la que pertenecen los pliegos del seed (solo dev/staging, jamás prod).
export const DEMO_ORG = {
  slug: 'demo',
  name: 'Organización Demo',
  plan: 'trial',
};

export const MOCK_PLIEGOS = [
  {
    id: '2026-7008',
    expediente: '2026/7008',
    titulo: 'Soporte Técnico de Sistemas',
    organismo: 'GISS · Seguridad Social',
    fechaAnalisis: '04 jul 2026',
    fechaLimite: '15 jul 2026',
    importe: 18500000,
    lotes: 3,
    estado: 'analizado',
    procedimiento: 'Abierto SARA',
    ens: 'Alto',
  },
  {
    id: '2026-4521',
    expediente: '2026/4521',
    titulo: 'Modernización de la plataforma EDR/XDR',
    organismo: 'AGE · Ministerio Interior',
    fechaAnalisis: '02 jul 2026',
    fechaLimite: '22 jul 2026',
    importe: 4520000,
    lotes: 1,
    estado: 'analizado',
    procedimiento: 'Abierto',
    ens: 'Alto',
  },
  {
    id: '2026-2145',
    expediente: '2026/2145',
    titulo: 'Renovación firewalls perimetrales Fortinet',
    organismo: 'Ministerio de Justicia',
    fechaAnalisis: '01 jul 2026',
    fechaLimite: '18 jul 2026',
    importe: 3120000,
    lotes: 1,
    estado: 'procesando',
    procedimiento: 'Abierto',
    ens: 'Alto',
  },
  {
    id: '2026-5210',
    expediente: '2026/5210',
    titulo: 'Servicios de ciberseguridad municipales',
    organismo: 'Ajuntament de Barcelona',
    fechaAnalisis: '28 jun 2026',
    fechaLimite: '10 jul 2026',
    importe: 6200000,
    lotes: 1,
    estado: 'revision',
    procedimiento: 'Abierto SARA',
    ens: 'Medio',
  },
  {
    id: '2026-3892',
    expediente: '2026/3892',
    titulo: 'Plataforma SOAR y automatización SOC',
    organismo: 'INAP',
    fechaAnalisis: '25 jun 2026',
    fechaLimite: '05 jul 2026',
    importe: 2820000,
    lotes: 2,
    estado: 'analizado',
    procedimiento: 'Abierto',
    ens: 'Alto',
  },
  {
    id: '2026-6034',
    expediente: '2026/6034',
    titulo: 'Auditoría ENS Nivel Alto',
    organismo: 'Junta de Andalucía',
    fechaAnalisis: '22 jun 2026',
    fechaLimite: '30 jun 2026',
    importe: 1810000,
    lotes: 1,
    estado: 'analizado',
    procedimiento: 'Simplificado',
    ens: 'Alto',
  },
];

export const MOCK_ANALYSIS = {
  '2026-7008': {
    resumen: {
      objeto: 'Prestación de servicios de soporte técnico de sistemas para la Gerencia de Informática de la Seguridad Social, incluyendo servicios gestionados y equipos de trabajo STS distribuidos en tres áreas de actuación.',
      cpv: ['72222300-0', '72514300-4', '72220000-3'],
      procedimiento: 'Abierto sujeto a regulación armonizada (SARA)',
      duracion: '48 meses',
      prorrogas: '2 prórrogas de 12 meses cada una',
    },
    lotes: [
      { numero: 1, descripcion: 'Gestión de la Producción', importe: 6200000, cpv: '72222300-0', confianza: 98 },
      { numero: 2, descripcion: 'Gestión de Sistemas', importe: 7800000, cpv: '72514300-4', confianza: 97 },
      { numero: 3, descripcion: 'Gestión de Comunicaciones', importe: 4500000, cpv: '72220000-3', confianza: 96 },
    ],
    perfiles: [
      { codigo: 'TSSX', categoria: 'Técnico Superior Sistemas Expert', headcount: 4, experiencia: 8, certs: ['ITIL Expert', 'CCNP', 'RHCE'], lote: 'Todos', confianza: 95 },
      { codigo: 'TSSA', categoria: 'Técnico Superior Sistemas A', headcount: 8, experiencia: 6, certs: ['ITIL Foundation', 'CCNA'], lote: 'Todos', confianza: 94 },
      { codigo: 'TSSB', categoria: 'Técnico Superior Sistemas B', headcount: 12, experiencia: 4, certs: ['ITIL Foundation'], lote: 'L1, L2', confianza: 92 },
      { codigo: 'TSSC', categoria: 'Técnico Superior Sistemas C', headcount: 6, experiencia: 3, certs: ['ITIL Foundation'], lote: 'L2', confianza: 90 },
      { codigo: 'TMSA', categoria: 'Técnico Medio Sistemas A', headcount: 10, experiencia: 2, certs: [], lote: 'L1, L3', confianza: 88 },
    ],
    solvencia: {
      tecnica: {
        experienciaMinima: '5 proyectos similares en los últimos 5 años',
        volumenNegocio: 20000000,
        clasificacion: 'V-05-d',
        certificaciones: ['ISO 27001', 'ISO 20000-1', 'ENS Alto', 'ISO 9001'],
      },
      economica: { seguroRC: 3000000, capitalMinimo: 5000000 },
    },
    criterios: [
      { tipo: 'automatico', criterio: 'Precio', peso: 40 },
      { tipo: 'juicio', criterio: 'Metodología y plan de trabajo', peso: 25 },
      { tipo: 'juicio', criterio: 'Composición y experiencia del equipo técnico', peso: 20 },
      { tipo: 'juicio', criterio: 'Plan de transición y transformación', peso: 10 },
      { tipo: 'automatico', criterio: 'Mejoras sobre requisitos mínimos', peso: 5 },
    ],
    penalizaciones: [
      { tipo: 'Retraso en entrega', descripcion: 'Incumplimiento de hito de transición', importe: '2% del importe del hito por semana de retraso' },
      { tipo: 'SLA', descripcion: 'Incumplimiento de nivel de servicio comprometido', importe: 'Hasta 10% de la facturación mensual del lote afectado' },
      { tipo: 'Confidencialidad', descripcion: 'Filtración de información sensible', importe: 'Hasta 20% del importe del contrato + resolución' },
    ],
    plazos: {
      limite: '15 de julio de 2026, 14:00',
      apertura: '17 de julio de 2026',
      formalizacion: '31 de agosto de 2026',
      inicio: '01 de septiembre de 2026',
      hitos: [
        'Kickoff y toma de conocimiento: 1 mes',
        'Fin período de transición: 3 meses',
        'Primera revisión de SLA: 6 meses',
        'Renovación de plantillas críticas: cada 12 meses',
      ],
    },
    marco: {
      ens: 'Nivel Alto',
      ccnStic: ['CCN-STIC 803', 'CCN-STIC 804', 'CCN-STIC 810', 'CCN-STIC 811'],
      normativa: ['RGPD', 'LOPDGDD', 'Real Decreto 311/2022'],
    },
  },
};

// Convierte un pliego mock a la fila que espera Prisma (`create`).
// Extraído para poder testear el mapeo de campos sin tocar la BD real.
export function toPliegoRow(p, organizationId = null) {
  return {
    organizationId,
    expediente: p.expediente,
    titulo: p.titulo,
    organismo: p.organismo,
    importe: p.importe,
    lotes: p.lotes,
    estado: p.estado,
    procedimiento: p.procedimiento,
    ens: p.ens,
    fechaAnalisis: parseShortDate(p.fechaAnalisis),
    fechaLimite: parseShortDate(p.fechaLimite),
    analysisData: MOCK_ANALYSIS[p.id] ?? null,
  };
}

// Crea (o refresca, idempotente por `slug`) la organización demo y la devuelve.
export async function seedOrganization(prisma, org = DEMO_ORG) {
  return prisma.organization.upsert({
    where: { slug: org.slug },
    update: { name: org.name, plan: org.plan },
    create: org,
  });
}

// Da membership de `owner` en la org a un usuario de Supabase Auth. El userId no puede
// inventarse aquí (los usuarios viven en el schema `auth`, fuera de Prisma), así que
// llega por parámetro/entorno; sin él, simplemente no se siembra membership.
export async function seedOwnerMembership(prisma, organizationId, userId) {
  if (!userId) return null;
  return prisma.membership.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    update: { role: 'owner' },
    create: { userId, organizationId, role: 'owner' },
  });
}

// Inserta (o actualiza, idempotente por `organizationId+expediente`) los pliegos demo usando el
// cliente Prisma que se le pase. Recibir el cliente por parámetro permite inyectar
// un doble en los tests en lugar de conectar contra Supabase.
export async function seedPliegos(prisma, pliegos = MOCK_PLIEGOS, organizationId) {
  if (!organizationId) throw new Error('seedPliegos requiere una organizationId.');
  for (const p of pliegos) {
    const row = toPliegoRow(p, organizationId);
    await prisma.pliego.upsert({
      where: { organizationId_expediente: { organizationId, expediente: p.expediente } },
      update: row,
      create: row,
    });
  }
  return pliegos.length;
}

// Solo abre conexión real y siembra cuando se ejecuta como script (`npm run db:seed`),
// no cuando el módulo se importa desde los tests.
async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.local' });
  const { PrismaClient } = await import('../src/generated/prisma/index.js');
  const { PrismaPg } = await import('@prisma/adapter-pg');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const org = await seedOrganization(prisma);
    const count = await seedPliegos(prisma, MOCK_PLIEGOS, org.id);
    // Opcional: SEED_OWNER_USER_ID (uuid de Authentication → Users en Supabase) te hace
    // owner de la org demo, para poder entrar con tu usuario cuando el API exija membership.
    const membership = await seedOwnerMembership(prisma, org.id, process.env.SEED_OWNER_USER_ID);
    console.log(`Seed completado: org "${org.slug}", ${count} pliegos${membership ? `, owner ${membership.userId}` : ''}.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
