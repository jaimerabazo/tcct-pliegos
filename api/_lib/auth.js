// Guard de autenticación para TODOS los endpoints de la API.
//
// El frontend manda el access token de Supabase Auth en `Authorization: Bearer <jwt>`.
// Aquí lo verificamos SIN round-trip a Supabase:
//   - Si existe `SUPABASE_JWT_SECRET` (proyectos con el JWT secret "legacy", HS256), se
//     verifica con el secret compartido.
//   - Si no, se usa el JWKS público del proyecto (`SUPABASE_URL` + /auth/v1/.well-known/
//     jwks.json) — los proyectos nuevos de Supabase firman con claves asimétricas (ES256).
//
// El control de acceso vive AQUÍ (app-level), no en RLS: accedemos a Postgres con Prisma
// vía el pooler (service role), que se salta las políticas RLS de Supabase. Modelo de
// acceso: workspace compartido — cualquier usuario autenticado (invitado por Jaime desde
// el dashboard de Supabase) puede usar la app entera; no hay ownership por fila.
import { jwtVerify, createRemoteJWKSet } from 'jose';

const encoder = new TextEncoder();

// JWKS remoto cacheado a nivel de módulo (jose cachea las claves y las refresca solo).
let remoteJwks = null;
function getRemoteJwks() {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  }
  return remoteJwks;
}

// ¿Hay configuración suficiente para verificar tokens? Sin ella los endpoints fallan
// CERRADOS (500 con mensaje claro), nunca abiertos.
export function authConfigured(env = process.env) {
  return Boolean(env.SUPABASE_JWT_SECRET || env.SUPABASE_URL);
}

// Extrae y verifica el Bearer token de la request. Devuelve { id, email } o null si
// falta/es inválido. `opts` es inyectable para tests (secret o clave pública locales),
// mismo espíritu que la inyección de Prisma: nada de vi.mock, se verifica crypto real.
export async function getUserFromRequest(req, opts = {}) {
  const header = req.headers?.authorization ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;

  const secret = opts.secret ?? process.env.SUPABASE_JWT_SECRET;
  const key = opts.key ?? (secret ? encoder.encode(secret) : getRemoteJwks());

  try {
    // Los access tokens de Supabase llevan audience "authenticated".
    const { payload } = await jwtVerify(match[1], key, { audience: 'authenticated' });
    if (!payload.sub) return null;
    return { id: payload.sub, email: payload.email ?? null };
  } catch {
    return null; // caducado, firma inválida, audience incorrecta, malformado…
  }
}

// Guard para usar al principio de cada handler:
//   const user = await requireUser(req, res);
//   if (!user) return; // requireUser ya ha respondido 401/500
export async function requireUser(req, res, opts = {}) {
  if (!authConfigured(opts.env ?? process.env) && !opts.key && !opts.secret) {
    res.status(500).json({ error: 'Falta configurar SUPABASE_JWT_SECRET (o SUPABASE_URL) en el entorno del servidor.' });
    return null;
  }
  const user = await getUserFromRequest(req, opts);
  if (!user) {
    res.status(401).json({ error: 'No autorizado. Inicia sesión para continuar.' });
    return null;
  }
  return user;
}
