// Cliente HTTP de organizaciones (Bloque 3). Bootstrap de la sesión: qué orgs tiene el
// usuario (con su rol), para que OrgGate decida la org activa antes de montar la app.
import { apiFetch, jsonOrThrow } from './http.js';

export async function listMyOrgs() {
  const res = await apiFetch('/api/orgs');
  return jsonOrThrow(res, 'No se han podido cargar tus organizaciones');
}
