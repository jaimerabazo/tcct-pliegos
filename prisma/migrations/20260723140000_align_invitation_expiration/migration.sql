-- Supabase Auth aplica Email OTP Expiration a los enlaces de invitación
-- (una hora por defecto). Acotamos también las invitaciones pendientes ya
-- existentes para que la base de datos no siga anunciando siete días.
UPDATE "invitations"
SET "expiresAt" = LEAST(
  "expiresAt",
  "createdAt" + INTERVAL '1 hour'
)
WHERE "acceptedAt" IS NULL;
