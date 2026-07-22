-- Backfill de la fase expand: el código tenant ya filtra siempre por organizationId,
-- por lo que ninguna fila pre-tenancy puede quedarse huérfana tras el despliegue.
--
-- Política de adopción segura:
--   * una sola organización existente -> adopta allí todos los pliegos legacy;
--   * ninguna organización -> crea un workspace legacy y conserva en él el acceso de
--     los usuarios Supabase que ya podían usar la aplicación antes del tenancy;
--   * varias organizaciones -> aborta: no hay una asignación que podamos inferir sin
--     riesgo de entregar datos a un tenant incorrecto.
DO $$
DECLARE
    legacy_pliego_count BIGINT;
    organization_count BIGINT;
    target_organization_id TEXT;
    target_membership_count BIGINT;
BEGIN
    SELECT COUNT(*)
      INTO legacy_pliego_count
      FROM "Pliego"
     WHERE "organizationId" IS NULL;

    IF legacy_pliego_count = 0 THEN
        RETURN;
    END IF;

    SELECT COUNT(*), MIN("id")
      INTO organization_count, target_organization_id
      FROM "organizations";

    IF organization_count = 0 THEN
        target_organization_id := 'legacy-pre-tenancy';

        INSERT INTO "organizations" (
            "id", "name", "slug", "plan", "createdAt", "updatedAt"
        ) VALUES (
            target_organization_id,
            'Workspace anterior a multi-tenancy',
            'legacy-pre-tenancy',
            'trial',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );
    ELSIF organization_count > 1 THEN
        RAISE EXCEPTION USING
            MESSAGE = format(
                'No se pueden adoptar %s pliegos legacy automáticamente: existen %s organizaciones.',
                legacy_pliego_count,
                organization_count
            ),
            HINT = 'Asigna organizationId explícitamente a las filas legacy antes de volver a desplegar esta migración.';
    END IF;

    UPDATE "Pliego"
       SET "organizationId" = target_organization_id
     WHERE "organizationId" IS NULL;

    -- En un despliegue pre-tenancy todavía puede no existir ninguna membership. Cuando
    -- la base es Supabase, todos los usuarios Auth existentes conservan el acceso que
    -- tenían antes, ahora dentro del único workspace adoptante. Si ya hay memberships,
    -- no ampliamos acceso: la organización mantiene su lista de miembros explícita.
    SELECT COUNT(*)
      INTO target_membership_count
      FROM "memberships"
     WHERE "organizationId" = target_organization_id;

    IF target_membership_count = 0 AND to_regclass('auth.users') IS NOT NULL THEN
        EXECUTE $membership_backfill$
            INSERT INTO "memberships" ("userId", "organizationId", "role", "createdAt")
            SELECT "id"::TEXT, $1, 'member'::"Role", CURRENT_TIMESTAMP
              FROM auth.users
            ON CONFLICT ("userId", "organizationId") DO NOTHING
        $membership_backfill$ USING target_organization_id;
    END IF;
END $$;

-- Deja una garantía verificable para el contract posterior y evita que un cambio en
-- este backfill pueda completar silenciosamente con filas aún invisibles para la API.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Pliego" WHERE "organizationId" IS NULL) THEN
        RAISE EXCEPTION 'El backfill de Pliego.organizationId no se ha completado.';
    END IF;
END $$;
