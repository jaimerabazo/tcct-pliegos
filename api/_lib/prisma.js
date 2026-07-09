import { PrismaClient } from '../../src/generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 ya no lee DATABASE_URL del schema — el PrismaClient necesita un
// adapter de driver explícito (aquí, node-postgres vía @prisma/adapter-pg).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Singleton obligatorio en serverless: sin esto, cada invocación (o cada hot-reload
// en `vercel dev`) crearía una conexión nueva y agotaría el pool de Postgres.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.__prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma;
}
