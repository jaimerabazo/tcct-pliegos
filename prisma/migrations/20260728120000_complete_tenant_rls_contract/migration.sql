-- Migración forward-only que cierra el contrato de tenancy sin reescribir la migración
-- RLS ya aplicada. Prisma Migrate no añade una transacción automáticamente: todo este
-- cambio, incluida su señal de capacidad (las políticas), debe publicarse o revertirse
-- como una sola unidad.
BEGIN;

-- La migración RLS anterior debe haber creado un rol utilizable y sin bypass. Comprobarlo
-- antes de publicar políticas nuevas evita que la aplicación active un rol inseguro.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
        RAISE EXCEPTION 'No existe el rol app_tenant requerido por el runtime.';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant' AND (rolbypassrls OR rolsuper)) THEN
        RAISE EXCEPTION 'app_tenant puede saltarse RLS: el aislamiento no sería real.';
    END IF;
END;
$$;

-- El backfill histórico ya abortó si quedaban filas sin organización. A partir de aquí
-- ni imports ni operaciones del propietario pueden crear pliegos huérfanos.
ALTER TABLE "Pliego" ALTER COLUMN "organizationId" SET NOT NULL;

-- Operaciones autorizadas dentro del tenant.
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "memberships"
    FOR ALL
    TO app_tenant
    USING ("organizationId" = current_setting('app.org_id', true))
    WITH CHECK ("organizationId" = current_setting('app.org_id', true));

-- Excepción de solo lectura para descubrir las organizaciones del usuario antes de que
-- el frontend pueda seleccionar una y enviar X-Organization-Id.
CREATE POLICY user_memberships_select ON "memberships"
    FOR SELECT
    TO app_tenant
    USING ("userId" = current_setting('app.user_id', true));

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "invitations"
    FOR ALL
    TO app_tenant
    USING ("organizationId" = current_setting('app.org_id', true))
    WITH CHECK ("organizationId" = current_setting('app.org_id', true));

-- Quien acepta aún no pertenece al tenant; esta función SECURITY DEFINER valida de forma
-- atómica token, email, caducidad y organización activa.
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT, TEXT, TEXT) TO app_tenant;

-- Verificación final. Cualquier excepción revierte NOT NULL, RLS, políticas y grants.
DO $$
DECLARE
    tabla TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_attribute
        WHERE attrelid = 'public."Pliego"'::regclass
          AND attname = 'organizationId'
          AND attnotnull
          AND NOT attisdropped
    ) THEN
        RAISE EXCEPTION 'Pliego.organizationId sigue aceptando NULL.';
    END IF;

    FOREACH tabla IN ARRAY ARRAY['Pliego', 'memberships', 'invitations', 'usage_events', 'audit_log'] LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_class
            WHERE oid = format('public.%I', tabla)::regclass
              AND relrowsecurity
        ) THEN
            RAISE EXCEPTION 'La tabla % no tiene RLS activo.', tabla;
        END IF;
    END LOOP;

    IF (
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
    ) <> 8 THEN
        RAISE EXCEPTION 'No están disponibles las ocho políticas RLS requeridas.';
    END IF;
END;
$$;

COMMIT;
