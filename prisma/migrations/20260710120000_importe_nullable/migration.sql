-- El importe total del pliego puede quedar "sin valor" desde la edición manual
-- (se persiste como NULL en vez de rechazar el guardado). Ver src/logic.js:blankNumberToNull.
-- AlterTable
ALTER TABLE "Pliego" ALTER COLUMN "importe" DROP NOT NULL;
