-- Verificación forward-only: app_tenant es un rol interno para SET LOCAL ROLE, no una
-- identidad con la que alguien deba poder conectarse directamente a PostgreSQL.
-- Las migraciones ya aplicadas no se modifican para preservar sus checksums.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'app_tenant'
    ) THEN
        RAISE EXCEPTION 'No existe el rol app_tenant requerido por el runtime.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = 'app_tenant'
          AND rolcanlogin
    ) THEN
        RAISE EXCEPTION 'app_tenant no puede tener LOGIN: permitiría conexiones directas fuera de la autorización de la aplicación.';
    END IF;
END;
$$;

COMMIT;
