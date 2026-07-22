// Guard de autenticación para TODOS los endpoints de la API.
//
// El frontend manda el access token de Supabase Auth en `Authorization: Bearer <jwt>`.
// Lo verificamos SIN round-trip a Supabase, eligiendo el método de verificación por el
// `alg` DEL PROPIO TOKEN (no por una config global del servidor):
//   - alg HS256  → secret compartido "legacy" (`SUPABASE_JWT_SECRET`).
//   - alg ES256/RS256 → clave pública del proyecto vía JWKS (proyectos nuevos de Supabase,
//     que firman con claves asimétricas). La URL del JWKS sale de `SUPABASE_URL` o, si no
//     está, de `VITE_SUPABASE_URL` (que existe en todos los entornos porque la usa el front).
//
// Por qué decidir por el `alg` y no por qué variable esté puesta: un `SUPABASE_JWT_SECRET`
// residual en el entorno (p.ej. el que `vercel dev` inyecta desde el proyecto Vercel) NO
// debe romper un proyecto que firma ES256. Con la selección por `alg`, el secret solo se
// usa para tokens HS256 y se ignora para los ES256. (Gotcha del bucle de login, 21/07/2026.)
//
// El control de acceso vive AQUÍ (app-level), no en RLS: accedemos a Postgres con Prisma
// vía el pooler (service role), que se salta el RLS de Supabase (el RLS llega en la fase 5
// como defensa en profundidad).
import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader } from 'jose';

const encoder = new TextEncoder();

// URL base del proyecto Supabase para construir el endpoint de JWKS.
function supabaseBaseUrl(env = process.env) {
  return env.SUPABASE_URL || env.VITE_SUPABASE_URL || null;
}

// JWKS remoto cacheado por URL a nivel de módulo (jose cachea las claves y las refresca
// solo). Se re-crea si cambia la URL (relevante en tests que la fuerzan).
let remoteJwks = null;
let remoteJwksUrl = null;
function getRemoteJwks(env = process.env) {
  const base = supabaseBaseUrl(env);
  if (!base) return null;
  const url = `${base}/auth/v1/.well-known/jwks.json`;
  if (!remoteJwks || remoteJwksUrl !== url) {
    remoteJwks = createRemoteJWKSet(new URL(url));
    remoteJwksUrl = url;
  }
  return remoteJwks;
}

// ¿Hay configuración suficiente para verificar tokens? Sin ella los endpoints fallan
// CERRADOS (500 con mensaje claro), nunca abiertos.
export function authConfigured(env = process.env) {
  return Boolean(env.SUPABASE_JWT_SECRET || env.SUPABASE_URL || env.VITE_SUPABASE_URL);
}

// Elige la clave de verificación para ESTE token. `opts.key`/`opts.secret` tienen prioridad
// (inyección en tests, mismo espíritu que la inyección de Prisma). Si no, se decide por el
// `alg` del token. Devuelve null si no se puede verificar (→ el llamante responde 401).
function verificationKey(token, opts) {
  if (opts.key) return opts.key;
  if (opts.secret) return encoder.encode(opts.secret);

  let alg;
  try {
    ({ alg } = decodeProtectedHeader(token));
  } catch {
    return null; // ni siquiera es un JWT
  }

  if (alg && alg.startsWith('HS')) {
    const secret = process.env.SUPABASE_JWT_SECRET;
    return secret ? encoder.encode(secret) : null;
  }
  // ES256/RS256/… (asimétrico): verificar con el JWKS del proyecto.
  return getRemoteJwks();
}

// Extrae y verifica el Bearer token de la request. Devuelve { id, email } o null si
// falta/es inválido. `opts` es inyectable para tests (secret o clave pública locales).
export async function getUserFromRequest(req, opts = {}) {
  const header = req.headers?.authorization ?? '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return null;

  const key = verificationKey(match[1], opts);
  if (!key) return null;

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
