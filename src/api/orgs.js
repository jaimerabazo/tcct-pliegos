// Cliente HTTP de organizaciones (Bloque 3). Bootstrap de la sesión: qué orgs tiene el
// usuario (con su rol), para que OrgGate decida la org activa antes de montar la app.
import { apiFetch, jsonOrThrow } from './http.js';

export async function listMyOrgs() {
  const res = await apiFetch('/api/orgs');
  return jsonOrThrow(res, 'No se han podido cargar tus organizaciones');
}

export async function createOrganization(name) {
  const res = await apiFetch('/api/orgs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return jsonOrThrow(res, 'No se ha podido crear la organización');
}

export async function createInvitation(organizationId, invitation) {
  const res = await apiFetch(`/api/orgs/${organizationId}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(invitation),
  });
  return jsonOrThrow(res, 'No se ha podido crear la invitación');
}

export async function acceptInvitation(token) {
  const res = await apiFetch('/api/invitations/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return jsonOrThrow(res, 'No se ha podido aceptar la invitación');
}

export async function listMembers(organizationId) {
  const res = await apiFetch(`/api/orgs/${organizationId}/members`);
  return jsonOrThrow(res, 'No se han podido cargar los miembros');
}

export async function removeMember(organizationId, userId) {
  const res = await apiFetch(`/api/orgs/${organizationId}/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) await jsonOrThrow(res, 'No se ha podido quitar el miembro');
}
