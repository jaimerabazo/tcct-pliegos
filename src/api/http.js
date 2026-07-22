// fetch con sesión + organización, compartido por todos los clientes de API.
// Extraído de pliegos.js en el Bloque 3 para que orgs.js reutilice el mismo transporte.
//
// - Adjunta el Bearer token de Supabase. La sesión la gobierna exclusivamente Supabase
//   (refresh/onAuthStateChange): una respuesta 401 de NUESTRA API no debe borrarla. Un
//   fallo de configuración del guard JWT también responde 401 y, si cerrásemos sesión
//   aquí, crearíamos el bucle login → /api/orgs → 401 → login → rate limit.
// - Adjunta X-Organization-Id con la org activa (localStorage). El header es una
//   AFIRMACIÓN que el servidor verifica siempre contra memberships (requireMember);
//   aquí solo declaramos en qué org estamos trabajando.
import { authHeader } from '../lib/supabase.js';

export const ACTIVE_ORG_KEY = 'activeOrgId';

export function getActiveOrgId() {
  try {
    return localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null; // storage inaccesible (SSR, privacidad): sin org activa
  }
}

export function setActiveOrgId(orgId) {
  try {
    if (orgId) {
      localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    } else {
      localStorage.removeItem(ACTIVE_ORG_KEY);
    }
  } catch {
    // sin storage no persistimos la elección; la app sigue funcionando en memoria
  }
}

export async function apiFetch(url, { headers = {}, ...options } = {}) {
  const orgId = getActiveOrgId();
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(await authHeader()),
      ...(orgId ? { 'X-Organization-Id': orgId } : {}),
      ...headers,
    },
  });
  return res;
}

export async function jsonOrThrow(res, fallbackMsg) {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `${fallbackMsg} (HTTP ${res.status}).`);
  }
  return res.json();
}
