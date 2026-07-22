// Gate de sesión: decide entre Login y la app. Vive FUERA de App para que los hooks de
// TanStack Query de App ni se monten sin sesión (si el gate estuviera dentro de App, la
// query de pliegos dispararía fetches sin token → 401 → signOut en bucle).
import { useSession } from './hooks/useSession.js';
import { signOut } from './lib/supabase.js';
import { Login } from './views/Login.jsx';
import { OrgGate } from './OrgGate.jsx';
import { theme } from './theme.js';

export function AuthGate() {
  const session = useSession();

  // Cargando la sesión del storage: pantalla neutra breve (evita el flash de login
  // al recargar estando ya autenticado).
  if (session === undefined) {
    return <div className="min-h-screen" style={{ background: theme.page }} />;
  }

  if (!session) {
    return <Login />;
  }

  // Con sesión: OrgGate resuelve la organización activa antes de montar la app
  // (Bloque 3 — toda llamada a la API necesita X-Organization-Id).
  return (
    <OrgGate
      user={{ email: session.user?.email ?? '', id: session.user?.id ?? '' }}
      onSignOut={signOut}
    />
  );
}
