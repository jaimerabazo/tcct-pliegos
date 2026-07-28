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

// Tablas cuyo contenido pertenece a un tenant. `organizations` queda fuera a propósito:
// requireMember necesita leerla ANTES de que exista organización activa (BLOQUE-1 §4).
export const RLS_PROTECTED_TABLES = ['Pliego', 'memberships', 'invitations', 'usage_events', 'audit_log'];

// Expresiones que hacen el aislamiento. Se comparan con lo que Postgres devuelve en
// pg_policies, que es la definición ya normalizada por el motor.
const ORG_SCOPE = `("organizationId" = current_setting('app.org_id'::text, true))`;
const USER_SCOPE = `("userId" = current_setting('app.user_id'::text, true))`;

// La huella EXACTA del contrato: qué política, sobre qué tabla, para qué comando y con
// qué expresión. Contar nombres no basta —un ALTER POLICY ... USING (true) conserva el
// nombre y desactiva el filtro—, así que se compara el contenido y se rechaza cualquier
// política que sobre: en Postgres las políticas PERMISSIVE se combinan con OR, de modo
// que una permissive de más abre el acceso aunque las demás sigan correctas.
const EXPECTED_POLICIES = [
  { table: 'Pliego', name: 'tenant_isolation', cmd: 'ALL', qual: ORG_SCOPE, withCheck: ORG_SCOPE },
  { table: 'memberships', name: 'tenant_isolation', cmd: 'ALL', qual: ORG_SCOPE, withCheck: ORG_SCOPE },
  { table: 'memberships', name: 'user_memberships_select', cmd: 'SELECT', qual: USER_SCOPE, withCheck: null },
  { table: 'invitations', name: 'tenant_isolation', cmd: 'ALL', qual: ORG_SCOPE, withCheck: ORG_SCOPE },
  { table: 'usage_events', name: 'tenant_select', cmd: 'SELECT', qual: ORG_SCOPE, withCheck: null },
  { table: 'usage_events', name: 'tenant_insert', cmd: 'INSERT', qual: null, withCheck: ORG_SCOPE },
  { table: 'audit_log', name: 'tenant_select', cmd: 'SELECT', qual: ORG_SCOPE, withCheck: null },
  { table: 'audit_log', name: 'tenant_insert', cmd: 'INSERT', qual: null, withCheck: ORG_SCOPE },
];

// Los espacios del deparse de Postgres no son parte del contrato; la expresión sí.
const canonical = (expression) => (expression == null ? null : String(expression).replace(/\s+/g, ''));

// PURA (testeable sin base de datos): ¿las políticas vivas son EXACTAMENTE las esperadas?
// Devuelve null si todo cuadra, o el motivo del rechazo — que se registra para que una
// deriva de RLS se pueda diagnosticar sin adivinar.
export function findPolicyContractBreach(rows = []) {
  const actual = rows.map((row) => ({
    table: row.tablename,
    name: row.policyname,
    cmd: row.cmd,
    permissive: row.permissive,
    roles: row.roles,
    qual: canonical(row.qual),
    withCheck: canonical(row.with_check),
  }));

  for (const expected of EXPECTED_POLICIES) {
    const found = actual.find((row) => row.table === expected.table && row.name === expected.name);
    if (!found) return `falta la política ${expected.table}.${expected.name}`;
    if (found.cmd !== expected.cmd) return `${expected.table}.${expected.name} aplica a ${found.cmd}, se esperaba ${expected.cmd}`;
    if (found.qual !== canonical(expected.qual)) return `${expected.table}.${expected.name} tiene un USING distinto del contrato`;
    if (found.withCheck !== canonical(expected.withCheck)) return `${expected.table}.${expected.name} tiene un WITH CHECK distinto del contrato`;
    // Una política dirigida a PUBLIC (o a otro rol) no protege lo que creemos.
    if (!/\bapp_tenant\b/.test(found.roles ?? '')) return `${expected.table}.${expected.name} no está limitada a ${APP_TENANT_ROLE}`;
  }

  const sobrante = actual.find((row) => !EXPECTED_POLICIES.some(
    (expected) => expected.table === row.table && expected.name === row.name,
  ));
  // Una RESTRICTIVE de más solo puede restringir (se combina con AND): no es una fuga.
  if (sobrante && sobrante.permissive !== 'RESTRICTIVE') {
    return `política no prevista ${sobrante.table}.${sobrante.name} (permissive: amplía el acceso)`;
  }

  return null;
}

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
      -- El interruptor real del RLS es relrowsecurity: DISABLE ROW LEVEL SECURITY deja
      -- intactas las filas de pg_policies, así que mirar solo las políticas daría por
      -- bueno un contrato roto y asumiría app_tenant sobre una tabla abierta de par en par.
      AND (
        SELECT count(*)
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY(${RLS_PROTECTED_TABLES})
          AND c.relrowsecurity
      ) = ${RLS_PROTECTED_TABLES.length} AS "protectionsReady",
      -- La DEFINICIÓN de cada política viaja entera para validarla en findPolicyContractBreach:
      -- el nombre y el interruptor pueden estar bien y la expresión haber sido vaciada
      -- (ALTER POLICY ... USING (true)) o haberse añadido una permissive que amplía el acceso.
      COALESCE((
        SELECT json_agg(row_to_json(pol))
        FROM (
          SELECT tablename, policyname, permissive, roles::text AS roles, cmd, qual, with_check
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = ANY(${RLS_PROTECTED_TABLES})
        ) pol
      ), '[]'::json) AS "policies",
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
    throw new Error('El contrato RLS desplegado está incompleto: falta el rol o el RLS de alguna tabla.');
  }
  const breach = findPolicyContractBreach(capability.policies ?? []);
  if (breach) {
    throw new Error(`El contrato RLS ha derivado: ${breach}.`);
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
