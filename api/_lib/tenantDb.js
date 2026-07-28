// Puente entre el guard de la aplicación y el RLS de Postgres (fase 5b).
//
// Toda operación sobre datos de cliente debe pasar por `withTenant`: abre una transacción,
// se cambia al rol `app_tenant` (que NO puede saltarse las políticas) y declara qué
// organización está activa. A partir de ahí es el motor —no el código— quien garantiza
// que no se lea ni se escriba nada de otro tenant.
//
// Por qué una transacción y no una variable de sesión: con el pooler, la misma conexión
// física sirve a peticiones de tenants distintos. `SET LOCAL` y `set_config(..., true)`
// se revierten al cerrar la transacción, así que el contexto no puede filtrarse a la
// siguiente petición. Una variable de sesión sí se filtraría — y sería una fuga.

// El rol lo crea la migración 20260726120000_rls_tenant_isolation. Es una constante del
// sistema, nunca entrada de usuario: `SET LOCAL ROLE` no admite parámetros y hay que
// interpolarlo, así que mantenerlo como literal cerrado es lo que lo hace seguro.
export const APP_TENANT_ROLE = 'app_tenant';
const TENANT_RLS_CONTRACT_MIGRATION = '20260728120000_complete_tenant_rls_contract';

// Gate de despliegue expand/contract: durante unos minutos puede estar vivo el código
// nuevo mientras la migración que crea app_tenant sigue esperando aprobación. Se exige
// el historial durable de Prisma para distinguir «la migración aún no llegó» de «llegó
// y después se rompió una política». Solo el primer caso permite el fallback. Una vez
// desplegado el contrato, cualquier política ausente o rol inseguro falla cerrado.
async function canAssumeTenantRole(tx) {
  const [capability] = await tx.$queryRaw`
    SELECT
      EXISTS (
        SELECT 1
        FROM public."_prisma_migrations"
        WHERE migration_name = ${TENANT_RLS_CONTRACT_MIGRATION}
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      ) AS "contractDeployed",
      to_regrole(${APP_TENANT_ROLE}) IS NOT NULL
      AND (
        SELECT count(*)
        FROM pg_policies
        WHERE schemaname = 'public'
          AND (
            (tablename = 'Pliego' AND policyname = 'tenant_isolation')
            OR (tablename = 'memberships'
              AND policyname IN ('tenant_isolation', 'user_memberships_select'))
            OR (tablename = 'invitations' AND policyname = 'tenant_isolation')
            OR (tablename IN ('usage_events', 'audit_log')
              AND policyname IN ('tenant_select', 'tenant_insert'))
          )
      ) = 8
      -- Contar políticas NO basta: ALTER TABLE ... DISABLE ROW LEVEL SECURITY deja las
      -- filas de pg_policies intactas, así que el recuento seguiría dando 8 mientras la
      -- tabla queda de par en par. Sin esta comprobación, el gate daría por bueno un
      -- contrato roto y asumiría app_tenant: una query sin scope leería o modificaría
      -- las filas de todos los tenants, justo lo contrario de lo que protege este gate.
      -- El interruptor real es relrowsecurity, y se exige en las cinco tablas.
      AND (
        SELECT count(*)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('Pliego', 'memberships', 'invitations', 'usage_events', 'audit_log')
          AND c.relrowsecurity
      ) = 5 AS "protectionsReady",
      COALESCE((
        SELECT NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcanlogin)
          AND NOT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname IN (
                'Pliego', 'memberships', 'invitations', 'usage_events', 'audit_log',
                '_prisma_migrations'
              )
              AND (c.relowner = r.oid OR pg_has_role(r.oid, c.relowner, 'MEMBER'))
          )
        FROM pg_roles r
        WHERE r.rolname = ${APP_TENANT_ROLE}
      ), false) AS "roleSafe"
  `;
  if (capability?.contractDeployed !== true) return false;
  if (capability.protectionsReady !== true) {
    throw new Error('El contrato RLS desplegado está incompleto: falta el rol o alguna política.');
  }
  if (capability.roleSafe !== true) {
    throw new Error('app_tenant no es seguro: puede iniciar sesión, eludir RLS o ejercer ownership.');
  }
  return true;
}

// Ejecuta `callback` con un cliente Prisma restringido a `organizationId`.
//
//   const pliegos = await withTenant(prisma, ctx.orgId, (db) => listPliegos(db, ctx.orgId));
//
// El `where organizationId` explícito de los handlers NO desaparece: sigue siendo la
// Capa 2. Esto es la Capa 3, la que aguanta cuando la 2 falla.
export async function withTenant(client, organizationId, callback) {
  if (!organizationId) {
    // Fail-closed y ruidoso: sin organización, el RLS devolvería 0 filas silenciosamente
    // y el síntoma ("no veo mis datos") sería difícil de rastrear hasta aquí.
    throw new Error('withTenant requiere una organizationId.');
  }

  // El doble en memoria de los tests unitarios implementa $transaction/$executeRaw* como
  // no-ops, así que este mismo camino sirve con y sin Postgres detrás. app.org_id se fija
  // SIEMPRE: si la migración está a medias y RLS ya aplica por membership, las políticas
  // siguen teniendo contexto. SET ROLE solo se activa cuando la BD confirma que es seguro.
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
    if (await canAssumeTenantRole(tx)) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP_TENANT_ROLE}`);
    }
    return callback(tx);
  });
}

// Contexto de bootstrap: permite verificar/listar SOLO las memberships del usuario antes
// de que exista una organización activa. No fija app.org_id, por lo que no abre acceso a
// los demás miembros ni a invitaciones. El userId procede siempre del JWT ya verificado.
export async function withUser(client, userId, callback) {
  if (!userId) throw new Error('withUser requiere un userId.');

  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    if (await canAssumeTenantRole(tx)) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP_TENANT_ROLE}`);
    }
    return callback(tx);
  });
}
