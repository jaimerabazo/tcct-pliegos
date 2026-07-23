-- Corrige la aceptación cuando el usuario ya pertenece a la organización:
-- aplica el rol invitado, pero nunca degrada a un owner existente.
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
    p_token_hash TEXT,
    p_user_id TEXT,
    p_email TEXT
)
RETURNS TABLE (
    "organizationId" TEXT,
    "name" TEXT,
    "slug" TEXT,
    "plan" TEXT,
    "role" "Role"
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    invitation_row invitations%ROWTYPE;
    organization_row organizations%ROWTYPE;
    membership_role "Role";
BEGIN
    SELECT *
      INTO invitation_row
      FROM invitations
     WHERE "tokenHash" = p_token_hash
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'La invitación no existe.';
    END IF;
    IF invitation_row."acceptedAt" IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'La invitación ya fue aceptada.';
    END IF;
    IF invitation_row."expiresAt" <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'La invitación ha caducado.';
    END IF;
    IF lower(invitation_row.email) <> lower(p_email) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'La invitación pertenece a otro email.';
    END IF;

    INSERT INTO memberships ("userId", "organizationId", "role", "createdAt")
    VALUES (
        p_user_id,
        invitation_row."organizationId",
        invitation_row.role,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT ("userId", "organizationId") DO UPDATE
    SET role = CASE
        WHEN memberships.role = 'owner'::"Role" THEN memberships.role
        ELSE EXCLUDED.role
    END;

    UPDATE invitations
       SET "acceptedAt" = CURRENT_TIMESTAMP
     WHERE id = invitation_row.id;

    SELECT m.role
      INTO membership_role
      FROM memberships m
     WHERE m."userId" = p_user_id
       AND m."organizationId" = invitation_row."organizationId";

    SELECT *
      INTO organization_row
      FROM organizations
     WHERE id = invitation_row."organizationId"
       AND "deletedAt" IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'La organización ya no está activa.';
    END IF;

    RETURN QUERY
    SELECT
        organization_row.id,
        organization_row.name,
        organization_row.slug,
        organization_row.plan,
        membership_role;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT, TEXT, TEXT) TO CURRENT_USER;
