-- La API ya trata (organizationId, expediente) como clave natural. Mantener el índice
-- global impediría que dos tenants analizasen el mismo expediente público.
-- La migración anterior adopta primero todas las filas legacy, así que el cambio de
-- índice conserva la unicidad de los datos existentes.
DROP INDEX "Pliego_expediente_key";

CREATE UNIQUE INDEX "Pliego_organizationId_expediente_key"
    ON "Pliego"("organizationId", "expediente");
