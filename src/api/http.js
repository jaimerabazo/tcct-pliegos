// fetch con sesión + organización, compartido por todos los clientes de API.
// Extraído de pliegos.js en el Bloque 3 para que orgs.js reutilice el mismo transporte.
//
// - Adjunta el Bearer token de Supabase. La sesión la gobierna exclusivamente Supabase
//   (refresh/onAuthStateChange): una respuesta 401 de NUESTRA API no debe borrarla. Un
//   fallo de configuración del guard JWT también responde 401 y, si cerrásemos sesión
//   aquí, crearíamos el bucle login → /api/orgs → 401 → login → rate limit.
// - Adjunta X-Organization-Id con la org activa (memoria + localStorage). El header es una
//   AFIRMACIÓN que el servidor verifica siempre contra memberships (requireMember);
//   aquí solo declaramos en qué org estamos trabajando.
import { authHeader } from '../lib/supabase.js';

export const ACTIVE_ORG_KEY = 'activeOrgId';

// Fuente de respaldo durante la vida de la SPA. Algunos navegadores exponen
// localStorage pero lanzan al leer/escribir (privacidad, almacenamiento bloqueado).
// OrgGate puede seguir fijando la org activa y apiFetch puede usarla aunque no persista.
let activeOrgIdInMemory = null;

export function getActiveOrgId() {
  try {
    const storedOrgId = localStorage.getItem(ACTIVE_ORG_KEY);
    if (storedOrgId) activeOrgIdInMemory = storedOrgId;
    return storedOrgId || activeOrgIdInMemory;
  } catch {
    return activeOrgIdInMemory;
  }
}

export function setActiveOrgId(orgId) {
  activeOrgIdInMemory = orgId || null;
  try {
    if (activeOrgIdInMemory) {
      localStorage.setItem(ACTIVE_ORG_KEY, activeOrgIdInMemory);
    } else {
      localStorage.removeItem(ACTIVE_ORG_KEY);
    }
  } catch {
    // La selección ya vive en memoria; solo perdemos persistencia entre recargas.
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
