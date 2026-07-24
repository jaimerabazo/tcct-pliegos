# Analizador de Pliegos

Plataforma de extracción y revisión de datos estructurados de pliegos de licitación pública española, asistida por IA.

> **Nota:** el proyecto nació como herramienta interna de presales (nombre provisional "TCCT Pliegos") y **está pivotando a un producto B2B SaaS comercial** para consultoras e integradores que licitan. La estrategia, arquitectura y roadmap vigentes viven en **`docs/`** (`ARQUITECTURA-SAAS.md`, `BLOQUE-1-DISENO-TENANCY.md`, `BLOQUE-2-ENTORNOS.md`). Este README documenta cómo arrancar y desplegar el estado actual del código.

El flujo funcional: inicias sesión (magic link), subes un PDF, Claude extrae el JSON estructurado, se persiste en Supabase (Postgres vía Prisma) y el frontend React consume la API REST con TanStack Query. Las ediciones manuales sobreviven a recargar la página. Todos los endpoints requieren sesión (JWT de Supabase).

## Arrancarlo en local

### Solo frontend (sin API ni BD)

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. **Ojo**: sin backend, el dashboard no carga pliegos y el modal de "Nuevo análisis" no puede llamar a `/api/analyze`.

### Full-stack en local (recomendado)

Copia `.env.example` a `.env.local` y rellénalo: `ANTHROPIC_API_KEY`, `DATABASE_URL` (usa el **Session pooler** de Supabase, no la conexión Direct — ver `CLAUDE.md` §5), `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, la configuración JWT aplicable, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

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
   - `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL` opcional, por defecto `claude-sonnet-5`)
   - `DATABASE_URL` (pooler de Supabase)
   - `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` (dominio público estable, nunca localhost ni una URL de deployment), la configuración JWT aplicable, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - El mapa por entorno (dev/staging/prod) está en `docs/BLOQUE-2-ENTORNOS.md §4`.
4. Las migraciones NO se aplican a mano: `.github/workflows/migrate.yml` corre `prisma migrate deploy` a staging (push a `develop`) y a prod (push a `main`, con gate de aprobación). Ver `docs/BLOQUE-2`.

**Seguridad**: todos los endpoints exigen sesión (guard JWT en `api/_lib/auth.js`); el registro es invite-only. El endpoint de invitaciones provisiona con Supabase Admin a los usuarios nuevos y envía un magic link a los ya registrados. El token interno no se devuelve al navegador del owner; viaja en el enlace al navegador del invitado y `OrgGate` lo elimina inmediatamente de la URL antes de canjearlo.

**Límite conocido**: las Vercel Functions (Node) aceptan hasta ~4.5 MB de payload. Pliegos muy grandes o escaneados pueden superarlo (mitigación planificada: Supabase Storage, ver `docs/ARQUITECTURA-SAAS.md §9`).

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

## Roadmap

El roadmap vigente es el del **pivot a B2B SaaS**, en `docs/` (Bloques 0-6):

- [x] Extracción real (Claude) + persistencia (Supabase/Prisma) + frontend conectado
- [x] Edición manual con confianza · KPIs · exportación a PowerPoint · CI con cobertura ≥90%
- [x] **Autenticación** (Supabase magic link invite-only + guard JWT) — mergeado a `main`
- [x] Bloque 0-1: arquitectura SaaS + diseño de multi-tenancy (`docs/`)
- [x] Bloque 2: entornos dev/staging + pipeline de migraciones
- [ ] **Bloque 3: multi-tenancy** (orgs, memberships, RLS, tests de aislamiento) ← siguiente
- [ ] Bloque 4: billing + metering (Stripe) · Bloque 5: hardening + RGPD · Bloque 6: pilotos

Features de producto aparcadas tras el pivot (segundo plano): comparativa entre pliegos, export Excel, generador de borrador RFP.
