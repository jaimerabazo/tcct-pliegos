-- Verificación forward-only del rol que ejecuta las consultas tenant. Las migraciones
-- anteriores ya están aplicadas y no deben reescribirse: este gate adicional rechaza
-- estados preexistentes donde app_tenant podría evitar RLS pese a ser NOBYPASSRLS.
BEGIN;

DO $$
DECLARE
    app_role_oid OID;
    unsafe_table TEXT;
BEGIN
    SELECT oid
      INTO app_role_oid
      FROM pg_roles
     WHERE rolname = 'app_tenant';

    IF app_role_oid IS NULL THEN
        RAISE EXCEPTION 'No existe el rol app_tenant requerido por el runtime.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE oid = app_role_oid
          AND (rolsuper OR rolbypassrls OR rolcreaterole)
    ) THEN
        RAISE EXCEPTION 'app_tenant tiene atributos que permiten eludir o alterar el aislamiento.';
    END IF;

    -- Rechazamos tanto ownership directo como membresía directa/indirecta en el rol
    -- propietario. MEMBER es compatible con PostgreSQL 15+ y cubre la posibilidad de
    -- heredar/asumir sus derechos y, por tanto, transferir también ese ownership.
    SELECT format('%I.%I', n.nspname, c.relname)
      INTO unsafe_table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('Pliego', 'memberships', 'invitations', 'usage_events', 'audit_log')
       AND (c.relowner = app_role_oid OR pg_has_role(app_role_oid, c.relowner, 'MEMBER'))
     LIMIT 1;

    IF unsafe_table IS NOT NULL THEN
        RAISE EXCEPTION 'app_tenant puede ejercer ownership sobre la tabla protegida %.', unsafe_table;
    END IF;
END;
$$;

COMMIT;
