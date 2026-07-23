import { createClient } from '@supabase/supabase-js';

let cachedClient = null;
let cachedConfig = null;

function adminConfig(env = process.env) {
  return {
    url: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function getSupabaseAdmin(env = process.env) {
  const config = adminConfig(env);
  if (!config.url || !config.serviceRoleKey) {
    const error = new Error(
      'Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el servidor.',
    );
    error.code = 'AUTH_INVITE_NOT_CONFIGURED';
    throw error;
  }

  const cacheKey = `${config.url}:${config.serviceRoleKey}`;
  if (!cachedClient || cachedConfig !== cacheKey) {
    cachedClient = createClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    cachedConfig = cacheKey;
  }
  return cachedClient;
}

const EXISTING_USER_ERROR_CODES = new Set(['email_exists', 'user_already_exists']);

function authInviteError(cause) {
  const error = new Error('Supabase Auth no ha podido enviar la invitación.');
  error.code = 'AUTH_INVITE_FAILED';
  error.cause = cause;
  return error;
}

// Provisiona los emails nuevos con una invitación de Auth. Supabase rechaza esa
// operación si el email ya corresponde a un usuario confirmado; en ese caso enviamos
// un magic link sin permitir signup. Ambos correos vuelven a la app con el token
// interno de organización y la service-role key nunca sale del servidor.
export async function inviteUserByEmail(
  email,
  redirectTo,
  { env = process.env, client } = {},
) {
  const admin = client || getSupabaseAdmin(env);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!error) return data.user;

  if (!EXISTING_USER_ERROR_CODES.has(error.code)) {
    throw authInviteError(error);
  }

  const { error: magicLinkError } = await admin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
  if (magicLinkError) throw authInviteError(magicLinkError);

  return null;
}
