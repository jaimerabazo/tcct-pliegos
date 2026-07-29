-- app_tenant necesita leer organizaciones y crear una durante el bootstrap, pero ninguna
-- ruta de runtime actualiza ni elimina organizaciones. Retirar esos permisos evita que
-- una query accidentalmente unscoped pueda modificar otro tenant.
BEGIN;

REVOKE UPDATE, DELETE ON TABLE public.organizations FROM app_tenant;

-- Verificación efectiva: también detecta permisos heredados u ownership que hicieran
-- inútil el REVOKE directo anterior.
DO $$
BEGIN
    IF has_table_privilege('app_tenant', 'public.organizations', 'UPDATE')
       OR has_table_privilege('app_tenant', 'public.organizations', 'DELETE') THEN
        RAISE EXCEPTION 'app_tenant todavía puede actualizar o eliminar organizaciones.';
    END IF;

    IF NOT has_table_privilege('app_tenant', 'public.organizations', 'SELECT')
       OR NOT has_table_privilege('app_tenant', 'public.organizations', 'INSERT') THEN
        RAISE EXCEPTION 'app_tenant ha perdido permisos necesarios para el bootstrap de organizaciones.';
    END IF;
END;
$$;

COMMIT;
