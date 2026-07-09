-- CreateTable
CREATE TABLE "Pliego" (
    "id" TEXT NOT NULL,
    "expediente" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "organismo" TEXT NOT NULL,
    "importe" DOUBLE PRECISION NOT NULL,
    "lotes" INTEGER NOT NULL,
    "estado" TEXT NOT NULL,
    "procedimiento" TEXT NOT NULL,
    "ens" TEXT NOT NULL,
    "fechaAnalisis" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaLimite" TIMESTAMP(3),
    "analysisData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pliego_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pliego_expediente_key" ON "Pliego"("expediente");
