-- El runtime usa la migración contractual terminada como señal durable de que el RLS ya
-- fue desplegado. app_tenant debe poder leerla, pero nunca borrarla o modificarla para
-- hacer que una protección rota parezca un rollout aún pendiente.
BEGIN;

REVOKE INSERT, UPDATE, DELETE ON TABLE public."_prisma_migrations" FROM app_tenant;

DO $$
BEGIN
    IF has_table_privilege('app_tenant', 'public."_prisma_migrations"', 'INSERT')
       OR has_table_privilege('app_tenant', 'public."_prisma_migrations"', 'UPDATE')
       OR has_table_privilege('app_tenant', 'public."_prisma_migrations"', 'DELETE') THEN
        RAISE EXCEPTION 'app_tenant todavía puede alterar el historial de migraciones.';
    END IF;

    IF NOT has_table_privilege('app_tenant', 'public."_prisma_migrations"', 'SELECT') THEN
        RAISE EXCEPTION 'app_tenant no puede leer la señal del contrato RLS desplegado.';
    END IF;
END;
$$;

COMMIT;
