-- El backfill legacy creó memberships con rol `member`, por lo que el workspace
-- adoptante podía quedar accesible pero sin nadie capaz de administrar el equipo.
--
-- Repara tanto ese caso como cualquier otra organización activa sin owner. Elegimos
-- de forma determinista la membership más antigua para no conceder el rol a más de
-- una persona; userId sirve de desempate para backfills creados en la misma sentencia.
WITH "ownerCandidates" AS (
    SELECT DISTINCT ON (m."organizationId")
           m."userId",
           m."organizationId"
      FROM "memberships" m
      JOIN "organizations" o
        ON o."id" = m."organizationId"
     WHERE o."deletedAt" IS NULL
       AND NOT EXISTS (
           SELECT 1
             FROM "memberships" current_owner
            WHERE current_owner."organizationId" = m."organizationId"
              AND current_owner."role" = 'owner'::"Role"
       )
     ORDER BY m."organizationId", m."createdAt", m."userId"
)
UPDATE "memberships" m
   SET "role" = 'owner'::"Role"
  FROM "ownerCandidates" candidate
 WHERE m."userId" = candidate."userId"
   AND m."organizationId" = candidate."organizationId";

-- Una organización activa sin memberships no tiene un candidato seguro. En vez de
-- completar el despliegue dejando OrgGate sin onboarding ni administración, hacemos
-- visible el dato inválido para que se asigne un usuario explícitamente.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM "organizations" o
         WHERE o."deletedAt" IS NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM "memberships" m
                WHERE m."organizationId" = o."id"
                  AND m."role" = 'owner'::"Role"
           )
    ) THEN
        RAISE EXCEPTION USING
            MESSAGE = 'Existe al menos una organización activa sin owner.',
            HINT = 'Crea una membership con rol owner para cada organización activa sin miembros y vuelve a desplegar la migración.';
    END IF;
END $$;
