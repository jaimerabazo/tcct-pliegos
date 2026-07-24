// Gate de organización (Bloque 3): entre la sesión (AuthGate) y la app. Resuelve las
// orgs del usuario y fija la org activa ANTES de montar App — así ninguna query de
// pliegos sale sin X-Organization-Id (el backend la rechazaría con 400).
//
// Estados: cargando → pantalla neutra (como AuthGate) · invitación → aceptación segura ·
// sin orgs → alta self-service de organización · con orgs → App.
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2 } from 'lucide-react';
import {
  acceptInvitation as acceptInvitationRequest,
  createOrganization,
  listMyOrgs,
} from './api/orgs.js';
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
  const queryClient = useQueryClient();
  const queryKey = tenantQueryKeys.orgs(user.id);
  const [invitationToken] = useState(
    () => new URLSearchParams(window.location.search).get('invitation'),
  );
  const acceptanceStarted = useRef(false);
  const { data: orgs, isLoading, isError, error, refetch } = useQuery({
    // El QueryClient sobrevive al sign-out. Separar por usuario impide que una sesión
    // nueva resuelva su org activa con memberships cacheadas de la anterior.
    queryKey,
    queryFn: listMyOrgs,
  });
  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: (organization) => {
      setActiveOrgId(organization.id);
      queryClient.setQueryData(queryKey, (current = []) => [...current, organization]);
    },
  });
  const acceptMutation = useMutation({
    mutationFn: acceptInvitationRequest,
    onSuccess: async (organization) => {
      await queryClient.cancelQueries({ queryKey });
      setActiveOrgId(organization.organizationId);
      queryClient.setQueryData(queryKey, (current = []) => [
        ...current.filter((org) => org.id !== organization.organizationId),
        {
          id: organization.organizationId,
          name: organization.name,
          slug: organization.slug,
          plan: organization.plan,
          role: organization.role,
        },
      ]);
      const url = new URL(window.location.href);
      url.searchParams.delete('invitation');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    },
  });

  useEffect(() => {
    if (!invitationToken || acceptanceStarted.current) return;
    acceptanceStarted.current = true;
    // El token es una credencial de un solo uso: se retira de la barra de direcciones
    // antes de hacer la request para no dejarlo en capturas, historial ni referrers.
    const url = new URL(window.location.href);
    url.searchParams.delete('invitation');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    acceptMutation.mutate(invitationToken);
  }, [acceptMutation, invitationToken]);

  if (invitationToken && (acceptMutation.isIdle || acceptMutation.isPending)) {
    return (
      <CenteredScreen>
        <Loader2 size={22} color={theme.link} className="animate-spin mx-auto mb-3" />
        <p className="text-sm" style={{ color: theme.textMuted }}>Aceptando invitación…</p>
      </CenteredScreen>
    );
  }

  if (acceptMutation.isError) {
    return (
      <CenteredScreen>
        <p className="text-sm mb-4" role="alert" style={{ color: theme.errorText }}>
          {acceptMutation.error?.message || 'No se ha podido aceptar la invitación.'}
        </p>
        <button
          type="button"
          onClick={() => {
            acceptanceStarted.current = false;
            acceptMutation.reset();
          }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: theme.primary }}
        >
          Reintentar
        </button>
      </CenteredScreen>
    );
  }

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
        <OrganizationOnboarding
          email={user.email}
          onCreate={(name) => createMutation.mutateAsync(name)}
          onSignOut={onSignOut}
          isCreating={createMutation.isPending}
          error={createMutation.error}
        />
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

export function OrganizationOnboarding({ email, onCreate, onSignOut, isCreating, error }) {
  const [name, setName] = useState('');
  const canSubmit = name.trim().length >= 2 && !isCreating;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    await onCreate(name.trim()).catch(() => {});
  };

  return (
    <div className="rounded-lg border p-6 text-left" style={{ background: theme.card, borderColor: theme.border }}>
      <div className="w-10 h-10 rounded-md flex items-center justify-center mb-4" style={{ background: theme.accentLight }}>
        <Building2 size={19} color={theme.link} strokeWidth={2} />
      </div>
      <h1
        className="text-lg font-medium mb-2"
        style={{ color: theme.text, fontFamily: 'Space Grotesk, sans-serif' }}
      >
        Crea tu organización
      </h1>
      <p className="text-sm mb-5" style={{ color: theme.textMuted, fontFamily: 'Inter, sans-serif' }}>
        Será el espacio privado de tu equipo. Tú quedarás como owner y podrás invitar a otras personas.
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="organization-name" className="block text-xs font-medium mb-1.5" style={{ color: theme.text }}>
          Nombre de la empresa
        </label>
        <input
          id="organization-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ej. Acme Consulting"
          autoFocus
          className="w-full px-3 py-2.5 rounded-md border text-sm outline-none"
          style={{ borderColor: theme.border, color: theme.text, background: theme.white }}
        />
        {error && (
          <p className="text-xs mt-2" role="alert" style={{ color: theme.errorText }}>
            {error.message}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium"
          style={{
            background: canSubmit ? theme.primary : theme.muted,
            color: canSubmit ? theme.white : theme.textMuted,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          {isCreating && <Loader2 size={14} className="animate-spin" />}
          {isCreating ? 'Creando…' : 'Crear organización'}
        </button>
      </form>
      <div className="mt-5 pt-4 border-t flex items-center justify-between text-xs" style={{ borderColor: theme.border, color: theme.textMuted }}>
        <span>{email}</span>
        <button type="button" onClick={onSignOut} style={{ color: theme.link }}>Cerrar sesión</button>
      </div>
    </div>
  );
}
