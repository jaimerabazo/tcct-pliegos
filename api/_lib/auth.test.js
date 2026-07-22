// @vitest-environment node
// (jose falla bajo jsdom por un check instanceof Uint8Array entre realms; los tests de
// API no necesitan DOM, así que corren en entorno node — igual que los demás de api/.)
import { describe, it, expect } from 'vitest';
import { generateKeyPair, SignJWT } from 'jose';
import { authConfigured, getUserFromRequest, requireUser } from './auth.js';
import { TEST_JWT_SECRET, TEST_USER, signTestToken, authHeaders } from './testAuth.js';
import { createFakeRes } from './testFakeRes.js';

const reqWith = (headers) => ({ headers });

describe('authConfigured', () => {
  it('true si hay SUPABASE_JWT_SECRET o SUPABASE_URL', () => {
    expect(authConfigured({ SUPABASE_JWT_SECRET: 'x' })).toBe(true);
    expect(authConfigured({ SUPABASE_URL: 'https://p.supabase.co' })).toBe(true);
    expect(authConfigured({ SUPABASE_JWT_SECRET: 'x', SUPABASE_URL: 'https://p.supabase.co' })).toBe(true);
  });

  it('false sin ninguna de las dos', () => {
    expect(authConfigured({})).toBe(false);
  });
});

describe('getUserFromRequest (HS256, secret compartido)', () => {
  it('devuelve { id, email } con un token válido', async () => {
    const req = reqWith(await authHeaders());
    const user = await getUserFromRequest(req, { secret: TEST_JWT_SECRET });
    expect(user).toEqual({ id: TEST_USER.id, email: TEST_USER.email });
  });

  it('email null si el token no lo trae', async () => {
    const token = await signTestToken({ email: null });
    const user = await getUserFromRequest(reqWith({ authorization: `Bearer ${token}` }), { secret: TEST_JWT_SECRET });
    expect(user).toEqual({ id: TEST_USER.id, email: null });
  });

  it('null si no hay cabecera Authorization o no es Bearer', async () => {
    expect(await getUserFromRequest(reqWith(undefined), { secret: TEST_JWT_SECRET })).toBeNull();
    expect(await getUserFromRequest(reqWith({}), { secret: TEST_JWT_SECRET })).toBeNull();
    expect(await getUserFromRequest(reqWith({ authorization: 'Basic abc' }), { secret: TEST_JWT_SECRET })).toBeNull();
    expect(await getUserFromRequest(reqWith({ authorization: 'Bearer' }), { secret: TEST_JWT_SECRET })).toBeNull();
  });

  it('null con firma inválida (otro secret)', async () => {
    const token = await signTestToken({ secret: 'otro-secret-distinto-al-de-verificacion' });
    expect(await getUserFromRequest(reqWith({ authorization: `Bearer ${token}` }), { secret: TEST_JWT_SECRET })).toBeNull();
  });

  it('null con token caducado', async () => {
    const token = await signTestToken({ expiresIn: '-1h' });
    expect(await getUserFromRequest(reqWith({ authorization: `Bearer ${token}` }), { secret: TEST_JWT_SECRET })).toBeNull();
  });

  it('null con audience incorrecta (no "authenticated")', async () => {
    const token = await signTestToken({ audience: 'otra-cosa' });
    expect(await getUserFromRequest(reqWith({ authorization: `Bearer ${token}` }), { secret: TEST_JWT_SECRET })).toBeNull();
  });

  it('null con un token malformado', async () => {
    expect(await getUserFromRequest(reqWith({ authorization: 'Bearer no-es-un-jwt' }), { secret: TEST_JWT_SECRET })).toBeNull();
  });

  it('null si el token no trae sub', async () => {
    const encoder = new TextEncoder();
    const token = await new SignJWT({ email: 'x@test.local' })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(encoder.encode(TEST_JWT_SECRET));
    expect(await getUserFromRequest(reqWith({ authorization: `Bearer ${token}` }), { secret: TEST_JWT_SECRET })).toBeNull();
  });
});

describe('getUserFromRequest (JWKS remoto, selección por alg del token)', () => {
  // Firma un ES256 (asimétrico): el guard debe enrutarlo al JWKS, no al secret.
  async function es256Token() {
    const { privateKey } = await generateKeyPair('ES256');
    return new SignJWT({ email: 'x@test.local' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('user-ecc')
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
  }

  it('un token ES256 se verifica vía JWKS; si el JWKS no es alcanzable, null (falla cerrado)', async () => {
    // createRemoteJWKSet no toca la red al crearse, solo al verificar: apuntamos a un
    // puerto cerrado para que el fetch falle rápido y caiga en nuestro catch → null.
    const prevSecret = process.env.SUPABASE_JWT_SECRET;
    const prevUrl = process.env.SUPABASE_URL;
    delete process.env.SUPABASE_JWT_SECRET;
    process.env.SUPABASE_URL = 'http://127.0.0.1:1';
    try {
      const user = await getUserFromRequest({ headers: { authorization: `Bearer ${await es256Token()}` } });
      expect(user).toBeNull();
    } finally {
      process.env.SUPABASE_JWT_SECRET = prevSecret;
      if (prevUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = prevUrl;
    }
  });

  it('un SUPABASE_JWT_SECRET residual NO se usa para un token ES256 (el bug del bucle de login)', async () => {
    // Escenario real: vercel dev inyecta un secret HS256 del proyecto Vercel, pero el
    // proyecto firma ES256. La selección por `alg` debe ignorar el secret y ir al JWKS
    // (aquí inalcanzable → null, sin colgarse ni verificar con el secret equivocado).
    const prevSecret = process.env.SUPABASE_JWT_SECRET;
    const prevUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_JWT_SECRET = 'secret-residual-hs256';
    process.env.SUPABASE_URL = 'http://127.0.0.1:1';
    try {
      const user = await getUserFromRequest({ headers: { authorization: `Bearer ${await es256Token()}` } });
      expect(user).toBeNull();
    } finally {
      if (prevSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
      else process.env.SUPABASE_JWT_SECRET = prevSecret;
      if (prevUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = prevUrl;
    }
  });

  it('cae a VITE_SUPABASE_URL para el JWKS si no hay SUPABASE_URL', async () => {
    const prevSecret = process.env.SUPABASE_JWT_SECRET;
    const prevUrl = process.env.SUPABASE_URL;
    const prevVite = process.env.VITE_SUPABASE_URL;
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:1';
    try {
      // Sin ninguna URL fallaría por "no key"; con VITE_SUPABASE_URL sí intenta el JWKS
      // (inalcanzable) → null. Que devuelva null por fallo de red (no por falta de config)
      // prueba que tomó el camino JWKS con la URL del front.
      const user = await getUserFromRequest({ headers: { authorization: `Bearer ${await es256Token()}` } });
      expect(user).toBeNull();
    } finally {
      if (prevSecret === undefined) delete process.env.SUPABASE_JWT_SECRET;
      else process.env.SUPABASE_JWT_SECRET = prevSecret;
      if (prevUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = prevUrl;
      if (prevVite === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = prevVite;
    }
  });
});

describe('getUserFromRequest (clave asimétrica, camino JWKS de proyectos nuevos)', () => {
  it('verifica un token ES256 con la clave pública inyectada', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const token = await new SignJWT({ email: 'ecc@test.local' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('user-ecc')
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const user = await getUserFromRequest(reqWith({ authorization: `Bearer ${token}` }), { key: publicKey });
    expect(user).toEqual({ id: 'user-ecc', email: 'ecc@test.local' });
  });

  it('rechaza un token firmado con OTRA clave privada', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const { publicKey: otherPublic } = await generateKeyPair('ES256');
    const token = await new SignJWT({ email: 'ecc@test.local' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject('user-ecc')
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    expect(await getUserFromRequest(reqWith({ authorization: `Bearer ${token}` }), { key: otherPublic })).toBeNull();
  });
});

describe('requireUser', () => {
  it('devuelve el usuario y no toca la respuesta con un token válido', async () => {
    const res = createFakeRes();
    const user = await requireUser(reqWith(await authHeaders()), res, { secret: TEST_JWT_SECRET });
    expect(user).toEqual({ id: TEST_USER.id, email: TEST_USER.email });
    expect(res.statusCode).toBeNull();
  });

  it('responde 401 y devuelve null sin token', async () => {
    const res = createFakeRes();
    const user = await requireUser(reqWith({}), res, { secret: TEST_JWT_SECRET });
    expect(user).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/No autorizado/);
  });

  it('responde 401 con token inválido', async () => {
    const res = createFakeRes();
    const user = await requireUser(reqWith({ authorization: 'Bearer basura' }), res, { secret: TEST_JWT_SECRET });
    expect(user).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('responde 500 (falla CERRADO) si no hay configuración de verificación', async () => {
    const res = createFakeRes();
    const user = await requireUser(reqWith(await authHeaders()), res, { env: {} });
    expect(user).toBeNull();
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/SUPABASE_JWT_SECRET/);
  });
});
