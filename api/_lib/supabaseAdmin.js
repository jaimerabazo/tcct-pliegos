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

// Provisiona el usuario en Supabase Auth y hace que el correo de Supabase vuelva a la
// app con el token interno de organización. La service-role key nunca sale del servidor.
export async function inviteUserByEmail(email, redirectTo, { env = process.env } = {}) {
  const admin = getSupabaseAdmin(env);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    const invitationError = new Error('Supabase Auth no ha podido enviar la invitación.');
    invitationError.code = 'AUTH_INVITE_FAILED';
    invitationError.cause = error;
    throw invitationError;
  }
  return data.user;
}

