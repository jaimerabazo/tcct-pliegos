-- Capa 3 del aislamiento (docs/ARQUITECTURA-SAAS.md §6): Row-Level Security.
--
-- Las capas 1 (requireMember) y 2 (queries scoped) viven en el código. Esta vive en el
-- motor: aunque una query se escriba sin filtrar por organización, Postgres se niega a
-- devolver o aceptar filas de otro tenant.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UN ROL DEDICADO Y NO SOLO `FORCE ROW LEVEL SECURITY`
-- ─────────────────────────────────────────────────────────────────────────────
-- El diseño original (BLOQUE-1 §4) asumía que bastaba con FORCE. Al verificarlo contra
-- la base real apareció que el rol con el que la aplicación conecta en Supabase
-- (`postgres`) tiene el atributo BYPASSRLS: se salta TODAS las políticas, y FORCE no lo
-- impide (FORCE solo obliga al *propietario* de la tabla, no anula BYPASSRLS). Sin esta
-- corrección, todo el RLS sería decorativo.
--
-- Solución: un rol `app_tenant` SIN BYPASSRLS y que NO es propietario de las tablas. El
-- cliente de runtime hace `SET LOCAL ROLE app_tenant` dentro de la transacción de cada
-- request (ver api/_lib/tenantDb.js), así que las políticas se evalúan contra un rol que
-- no puede eludirlas. `SET LOCAL` muere con la transacción: imprescindible con el pooler,
-- donde la conexión se reutiliza entre peticiones de tenants distintos.
--
-- No se usa FORCE a propósito: el propietario (`postgres`) sigue necesitando operar sin
-- restricción en migraciones y backfills. La protección de runtime la da el cambio de rol.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rol de runtime
-- ─────────────────────────────────────────────────────────────────────────────
-- Solo NOLOGIN y NOBYPASSRLS explícitos: el resto de atributos (NOSUPERUSER, NOCREATEDB,
-- NOCREATEROLE) ya son el valor por defecto de CREATE ROLE. No se usa `ALTER ROLE ...
-- NOSUPERUSER` como refuerzo porque Supabase (extensión supautils) lo rechaza con
-- "permission denied to alter role"; la comprobación del final de esta migración cubre
-- ese hueco fallando en voz alta si el rol acabara con privilegios que eluden el RLS.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
        CREATE ROLE app_tenant NOLOGIN NOBYPASSRLS;
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_tenant;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_tenant;

-- Tablas creadas por migraciones futuras: que el rol las herede sin tener que recordarlo.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;

-- El rol que conecta debe poder asumir `app_tenant`. Se usa format() con el nombre real
-- del usuario: la sintaxis `GRANT ... TO CURRENT_USER` aborta la conexión en Supabase.
DO $$
BEGIN
    EXECUTE format('GRANT app_tenant TO %I', current_user);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Políticas de aislamiento
-- ─────────────────────────────────────────────────────────────────────────────
-- USING filtra lo que se puede LEER/tocar; WITH CHECK valida lo que queda tras un
-- INSERT/UPDATE. Sin WITH CHECK se podrían crear filas en la organización de otro.
--
-- `current_setting('app.org_id', true)` devuelve NULL si nadie fijó la organización, y
-- `columna = NULL` es NULL (no true): sin contexto no se ve NADA. Fail-closed por diseño
-- — un olvido del cliente deja al usuario sin datos, nunca con los de otro.

ALTER TABLE "Pliego" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Pliego"
    FOR ALL
    TO app_tenant
    USING ("organizationId" = current_setting('app.org_id', true))
    WITH CHECK ("organizationId" = current_setting('app.org_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Metering y auditoría: aislamiento + APPEND-ONLY
-- ─────────────────────────────────────────────────────────────────────────────
-- Solo se declaran políticas para SELECT e INSERT. Con RLS activo, toda operación sin
-- política que la ampare queda denegada, así que UPDATE y DELETE son imposibles para el
-- rol de runtime sin necesidad de reglas explícitas: un registro de auditoría que se
-- puede editar no es un registro de auditoría (BLOQUE-1 §1).

ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON "usage_events"
    FOR SELECT TO app_tenant
    USING ("organizationId" = current_setting('app.org_id', true));
CREATE POLICY tenant_insert ON "usage_events"
    FOR INSERT TO app_tenant
    WITH CHECK ("organizationId" = current_setting('app.org_id', true));

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_select ON "audit_log"
    FOR SELECT TO app_tenant
    USING ("organizationId" = current_setting('app.org_id', true));
CREATE POLICY tenant_insert ON "audit_log"
    FOR INSERT TO app_tenant
    WITH CHECK ("organizationId" = current_setting('app.org_id', true));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verificación: que la migración falle aquí si el blindaje no quedó puesto
-- ─────────────────────────────────────────────────────────────────────────────
-- Una migración de seguridad que "pasa" sin aplicar la seguridad es peor que no tenerla:
-- da una falsa sensación de protección. Estas comprobaciones la hacen fallar en voz alta.
DO $$
DECLARE
    tabla TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant' AND (rolbypassrls OR rolsuper)) THEN
        RAISE EXCEPTION 'app_tenant puede saltarse RLS: el aislamiento no sería real.';
    END IF;

    FOREACH tabla IN ARRAY ARRAY['Pliego', 'usage_events', 'audit_log'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_class
            WHERE oid = format('public.%I', tabla)::regclass AND relrowsecurity
        ) THEN
            RAISE EXCEPTION 'La tabla % no tiene RLS activo.', tabla;
        END IF;
    END LOOP;
END;
$$;
