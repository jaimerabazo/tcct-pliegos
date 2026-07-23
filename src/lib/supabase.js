// Cliente de Supabase Auth del frontend (solo auth: la BD se consume vía /api con
// Prisma). Glue de IO sin test unitario — mismo criterio que api/_lib/prisma.js.
//
// Resiliente a config ausente: sin VITE_SUPABASE_URL/ANON_KEY (p.ej. en CI, que no
// tiene .env.local) el cliente es null y los helpers degradan de forma segura, en vez
// de reventar en el import y tumbar todos los tests que toquen esta cadena de módulos.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured ? createClient(url, anonKey) : null;

// Access token de la sesión actual (o null). getSession lee del storage local, sin red.
export async function getAccessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Cabecera Authorization lista para spreadear en un fetch: {} si no hay sesión.
export async function authHeader() {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Magic link invite-only. Los usuarios son provisionados por el endpoint de invitación
// mediante Supabase Admin; shouldCreateUser=false impide el auto-registro desde el login.
export async function signInWithMagicLink(email) {
  if (!supabase) throw new Error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  // Conserva la URL que llevó al usuario al login. En particular, una invitación
  // abierta sin sesión necesita recuperar `?invitation=…` después del magic link
  // para que OrgGate pueda aceptarla. El hash se excluye porque Supabase puede
  // reservarlo para devolver los datos de la sesión.
  const redirectUrl = new URL(window.location.href);
  redirectUrl.hash = '';
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectUrl.toString(),
    },
  });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}
