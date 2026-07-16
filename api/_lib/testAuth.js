// Helper de tests para el guard de auth (api/_lib/auth.js): firma JWTs REALES (jose,
// HS256) con un secret de prueba — nada de vi.mock, se ejercita la verificación
// criptográfica de verdad. Mismo espíritu que testFakePrisma.js / testFakeRes.js.
//
// Importar este módulo instala TEST_JWT_SECRET en process.env.SUPABASE_JWT_SECRET
// (side effect deliberado y documentado): así los handlers bajo test verifican contra
// el mismo secret con el que firmamos, sin tocar la config real.
import { SignJWT } from 'jose';

export const TEST_JWT_SECRET = 'tcct-pliegos-test-secret-no-usar-en-produccion';

process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET;

const encoder = new TextEncoder();

export const TEST_USER = { id: 'user-test-1', email: 'jaime@test.local' };

// Firma un access token con el shape que emite Supabase Auth (sub/email/aud).
// Pasar `email: null` genera un token SIN claim de email (para probar ese caso).
export async function signTestToken({
  sub = TEST_USER.id,
  email = TEST_USER.email,
  audience = 'authenticated',
  expiresIn = '1h',
  secret = TEST_JWT_SECRET,
} = {}) {
  return new SignJWT(email === null ? {} : { email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encoder.encode(secret));
}

// Cabeceras listas para pasar en el `req` de un handler bajo test.
export async function authHeaders(overrides = {}) {
  const token = await signTestToken(overrides);
  return { authorization: `Bearer ${token}` };
}
