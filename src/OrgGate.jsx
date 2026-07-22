// Gate de organización (Bloque 3): entre la sesión (AuthGate) y la app. Resuelve las
// orgs del usuario y fija la org activa ANTES de montar App — así ninguna query de
// pliegos sale sin X-Organization-Id (el backend la rechazaría con 400).
//
// Estados: cargando → pantalla neutra (como AuthGate) · error → reintentar · sin orgs →
// aviso (el alta self-service y las invitaciones llegan en la fase 4) · con orgs → App.
import { useQuery } from '@tanstack/react-query';
import { listMyOrgs } from './api/orgs.js';
import { getActiveOrgId, setActiveOrgId } from './api/http.js';
import App from './App.jsx';
import { tenantQueryKeys } from './queryKeys.js';
import { theme } from './theme.js';

// Elige la org activa: la guardada si sigue siendo válida; si no, la primera.
// Exportada para testearla sin montar el componente.
export function resolveActiveOrg(orgs, storedId) {
  if (!orgs?.length) return null;
  return orgs.find((o) => o.id === storedId) ?? orgs[0];
}

function CenteredScreen({ children }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: theme.page }}
    >
      <div className="max-w-md w-full text-center">{children}</div>
    </div>
  );
}

export function OrgGate({ user, onSignOut }) {
  const { data: orgs, isLoading, isError, error, refetch } = useQuery({
    // El QueryClient sobrevive al sign-out. Separar por usuario impide que una sesión
    // nueva resuelva su org activa con memberships cacheadas de la anterior.
    queryKey: tenantQueryKeys.orgs(user.id),
    queryFn: listMyOrgs,
  });

  if (isLoading) {
    return <div className="min-h-screen" style={{ background: theme.page }} />;
  }

  if (isError) {
    return (
      <CenteredScreen>
        <p className="text-sm mb-4" style={{ color: theme.text, fontFamily: 'Inter, sans-serif' }}>
          No se han podido cargar tus organizaciones. {error?.message}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: theme.primary, fontFamily: 'Inter, sans-serif' }}
        >
          Reintentar
        </button>
      </CenteredScreen>
    );
  }

  const active = resolveActiveOrg(orgs, getActiveOrgId());

  if (!active) {
    return (
      <CenteredScreen>
        <h1
          className="text-lg font-medium mb-2"
          style={{ color: theme.text, fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Todavía no perteneces a ninguna organización
        </h1>
        <p className="text-sm mb-6" style={{ color: theme.textMuted, fontFamily: 'Inter, sans-serif' }}>
          Pide a un compañero que te invite a la suya, o contacta con el administrador.
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: theme.primary, fontFamily: 'Inter, sans-serif' }}
        >
          Cerrar sesión
        </button>
      </CenteredScreen>
    );
  }

  // Persistencia síncrona a propósito (no useEffect): apiFetch lee localStorage en el
  // momento de cada llamada, y las queries de App disparan al montarse — la org activa
  // tiene que estar guardada ANTES de renderizar App. Es idempotente.
  if (active.id !== getActiveOrgId()) {
    setActiveOrgId(active.id);
  }

  return <App user={user} org={active} onSignOut={onSignOut} />;
}
