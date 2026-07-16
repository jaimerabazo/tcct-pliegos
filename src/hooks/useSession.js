// Sesión de Supabase Auth como estado de React.
//   undefined → aún cargando (evita el flash de login al recargar con sesión válida)
//   null      → sin sesión (mostrar Login)
//   Session   → autenticado
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

export function useSession() {
  // Sin config de Supabase (CI, dev sin .env.local) no hay nada que cargar: null directo.
  const [session, setSession] = useState(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
}
