// Huella de las políticas RLS tal y como las devuelve pg_policies en una base sana.
//
// Está escrita A MANO, copiada de una consulta real contra Postgres, y NO se importa de
// tenantDb.js a propósito: si el fixture derivara del propio código bajo prueba, el test
// compararía el contrato consigo mismo y pasaría siempre. Aquí, si alguien cambia una
// política en producción sin actualizar este fichero, los tests lo delatan.
const ORG_SCOPE = `("organizationId" = current_setting('app.org_id'::text, true))`;
const USER_SCOPE = `("userId" = current_setting('app.user_id'::text, true))`;

export const rlsPolicy = (tablename, policyname, cmd, qual, with_check) => ({
  tablename,
  policyname,
  cmd,
  qual,
  with_check,
  permissive: 'PERMISSIVE',
  roles: '{app_tenant}',
});

export const healthyRlsPolicies = () => [
  rlsPolicy('Pliego', 'tenant_isolation', 'ALL', ORG_SCOPE, ORG_SCOPE),
  rlsPolicy('memberships', 'tenant_isolation', 'ALL', ORG_SCOPE, ORG_SCOPE),
  rlsPolicy('memberships', 'user_memberships_select', 'SELECT', USER_SCOPE, null),
  rlsPolicy('invitations', 'tenant_isolation', 'ALL', ORG_SCOPE, ORG_SCOPE),
  rlsPolicy('usage_events', 'tenant_select', 'SELECT', ORG_SCOPE, null),
  rlsPolicy('usage_events', 'tenant_insert', 'INSERT', null, ORG_SCOPE),
  rlsPolicy('audit_log', 'tenant_select', 'SELECT', ORG_SCOPE, null),
  rlsPolicy('audit_log', 'tenant_insert', 'INSERT', null, ORG_SCOPE),
];
