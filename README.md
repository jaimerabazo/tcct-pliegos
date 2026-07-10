# TCCT Pliegos · Analizador de Pliegos

Herramienta interna del equipo de presales de Telefónica Cybersecurity & Cloud Tech (TCCT) para extraer y revisar datos estructurados de pliegos de licitación pública.

El flujo completo ya es funcional: subes un PDF, Claude extrae el JSON estructurado, se persiste en Supabase (Postgres vía Prisma) y el frontend React consume la API REST con TanStack Query. Las ediciones manuales sobreviven a recargar la página.

## Arrancarlo en local

### Solo frontend (sin API ni BD)

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. **Ojo**: sin backend, el dashboard no carga pliegos y el modal de "Nuevo análisis" no puede llamar a `/api/analyze`.

### Full-stack en local (recomendado)

Necesitas `ANTHROPIC_API_KEY` y `DATABASE_URL` en `.env.local` (usa el **Session pooler** de Supabase, no la conexión Direct — ver `CLAUDE.md` §5).

```bash
npm install
npx vercel link      # una vez, para asociar la carpeta al proyecto de Vercel
npx vercel env pull  # o crea .env.local a mano
npm run db:migrate   # primera vez: aplica el schema
npm run db:seed      # opcional: puebla los 6 pliegos demo
npm run dev:api      # arranca vercel dev, sirve frontend + /api juntos
```

## Tests y CI

```bash
npm run test              # una vez
npm run test:watch        # modo interactivo
npm run test:coverage     # con umbral ≥90% en lo incluido en vitest.config.js
npm run build             # build de producción
```

En cada push/PR a `main` o `develop`, GitHub Actions (`.github/workflows/ci.yml`) corre `npm ci`, `npm run test:coverage` y `npm run build`. No necesita `DATABASE_URL` en CI — los tests usan un doble en memoria de Prisma.

## Desplegarlo en Vercel

1. Push a GitHub (`jaimerabazo/tcct-pliegos`).
2. [vercel.com](https://vercel.com) → Import Project → Deploy (detecta Vite automáticamente).
3. En Settings → Environment Variables (Production + Preview):
   - `ANTHROPIC_API_KEY` — obligatoria para `/api/analyze`
   - `DATABASE_URL` — obligatoria para cualquier endpoint que use Prisma (pooler de Supabase)
   - `ANTHROPIC_MODEL` — opcional; por defecto `claude-sonnet-5`
4. Cada `git push` a `main` redeploya automáticamente. `postinstall: prisma generate` corre en cada build.

**Seguridad**: la URL de Vercel es pública por defecto. Activa Vercel Password Protection antes de compartirla ampliamente.

**Límite conocido**: las Vercel Functions (Node) aceptan hasta ~4.5 MB de payload. Pliegos muy grandes o escaneados pueden superarlo.

## Estructura

```
tcct-pliegos/
├── api/
│   ├── analyze.js              POST — envía el PDF a Claude, valida y persiste
│   ├── pliegos/                GET/PATCH — CRUD de pliegos y analysisData
│   └── _lib/                   prisma singleton, schemas Zod, dobles de test
├── prisma/
│   ├── schema.prisma           Modelo Pliego (analysisData como Json)
│   ├── seed.js                 6 pliegos demo (idempotente)
│   └── migrations/
├── src/
│   ├── App.jsx                 shell: TanStack Query + navegación
│   ├── api/pliegos.js          cliente fetch + normalización de fechas
│   ├── components/             Sidebar, UploadModal, fields, section…
│   ├── views/                  Dashboard.jsx, Analysis.jsx
│   └── logic.js                KPIs, formateo, validación de descuadre
├── .github/workflows/ci.yml    CI en push/PR a main y develop
└── vitest.config.js            umbral de cobertura ≥90%
```

Los datos demo viven en `prisma/seed.js`, no en el frontend. Un pliego sin `analysisData` muestra estado vacío en la vista de análisis.

## Próximos pasos

- [x] Modal de upload con drag & drop del PDF
- [x] Extracción real vía API de Anthropic Claude
- [x] Persistencia en Supabase + API REST + frontend conectado
- [x] Edición manual de campos (persiste en BD)
- [x] KPIs reactivas, histograma por organismo, aviso de descuadre lotes↔importe
- [x] CI con tests y cobertura como gate
- [ ] Vista de comparativa entre dos pliegos
- [ ] Exportación real a Excel (SheetJS)
- [ ] Autenticación (SSO Telefónica si escala a producción)
- [ ] Generador de borrador RFP (siguiente caso de uso prioritario)
