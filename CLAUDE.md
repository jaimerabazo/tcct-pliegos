# CLAUDE.md

Contexto técnico para trabajar en este repositorio. La documentación de `docs/` es la
fuente de verdad para arquitectura, decisiones y estado de cada bloque.

## Producto

Aplicación B2B SaaS para analizar licitaciones públicas españolas. Recibe un PDF, extrae
datos estructurados con Claude, permite validarlos y editarlos, y genera una presentación
PowerPoint.

El producto nació como una herramienta interna llamada “TCCT Pliegos”, pero está
evolucionando hacia un producto comercial independiente. No ampliar el branding actual
ni introducir nuevas dependencias de Telefónica Tech.

## Estado actual

Rama estable de integración: `develop`.

Completado:

- autenticación invite-only con Supabase magic links;
- API protegida mediante JWT;
- persistencia con Supabase Postgres y Prisma;
- extracción con Claude Structured Outputs;
- edición de análisis y generación de PPTX;
- CI con tests, cobertura y build;
- entornos dev/staging y migraciones automáticas;
- Bloque 3, fases 1–4: organizaciones, memberships, scoping tenant, onboarding,
  invitaciones y gestión de equipo.

Pendiente para cerrar el Bloque 3:

- **Fase 5 — Contract + RLS:** columnas tenant no nulas, políticas RLS forzadas y
  contexto de organización con scope de transacción.
- **Fase 6 — Gate cross-tenant:** los siete escenarios de aislamiento contra
  PostgreSQL real como contrato de CI.

Documentos:

- `docs/ARQUITECTURA-SAAS.md`: visión y arquitectura objetivo.
- `docs/BLOQUE-1-DISENO-TENANCY.md`: diseño de datos, permisos y RLS.
- `docs/BLOQUE-2-ENTORNOS.md`: entornos, variables y migraciones.
- `docs/BLOQUE-3-IMPLEMENTACION-TENANCY.md`: implementación real y onboarding.

## Stack

- React 18, Vite 5 y Tailwind CSS 3.
- TanStack Query 5 para estado de servidor.
- Vercel Functions en `api/`.
- Supabase Auth y Postgres.
- Prisma 7 con `@prisma/adapter-pg`.
- Anthropic SDK para extracción y síntesis.
- `pptxgenjs` 3.12 para presentaciones.
- Vitest y React Testing Library.

El proyecto es JavaScript ESM. No introducir TypeScript de forma parcial.

## Flujo de aplicación

```text
AuthGate
  -> Login si no hay sesión
  -> OrgGate si hay sesión
       -> acepta invitación
       -> crea organización si el usuario no tiene ninguna
       -> fija la organización activa
       -> App
```

El cliente HTTP común está en `src/api/http.js`. Cada request autenticada incluye:

```text
Authorization: Bearer <JWT>
X-Organization-Id: <org activa>
```

`requireUser` verifica identidad. `requireMember` verifica organización, membership y
rol. El header de organización nunca se considera confiable por sí solo.

Toda query de datos de cliente debe incluir `organizationId`. Para recursos individuales,
un ID de otro tenant devuelve `404`.

## Archivos principales

```text
api/_lib/auth.js                  verificación JWT
api/_lib/authz.js                 guard requireMember
api/_lib/organizations.js         lógica de orgs, invitaciones y miembros
api/_lib/supabaseAdmin.js         invitaciones Auth y emails de usuarios
api/_lib/usage.js                 metering de operaciones LLM
api/_lib/prisma.js                singleton Prisma
api/_lib/schemas.js               contratos Zod
api/orgs/                         endpoints de organizaciones y equipo
api/invitations/accept.js         aceptación previa a membership
api/pliegos/                      API tenant de pliegos
api/analyze.js                    extracción y persistencia
src/OrgGate.jsx                   bootstrap de organización y onboarding
src/views/Team.jsx                gestión de equipo
src/api/http.js                   sesión y organización activa
src/api/orgs.js                   cliente de organizaciones
src/queryKeys.js                  claves de caché por usuario y tenant
prisma/schema.prisma              modelo de datos
prisma/migrations/                historial inmutable del schema
```

## Invariantes

- El creador de una organización es owner.
- Una organización activa no puede quedarse sin owner.
- Los tokens de invitación se guardan únicamente como SHA-256.
- Invitaciones y magic links caducan en una hora.
- Reenviar una invitación rota el token anterior.
- El email del JWT debe coincidir con el de la invitación.
- Un owner existente nunca se degrada al aceptar otra invitación.
- `usage_events` conserva tokens aunque no se conozca el precio del modelo.
- Las claves de TanStack Query incluyen `userId` y `organizationId`.

Los locks de `pg_advisory_xact_lock` deben ejecutarse con `$executeRaw`. El tipo de
retorno `void` falla al deserializarse con `$queryRaw` en Prisma 7.

## Base de datos y migraciones

`prisma.config.ts` carga `.env.local`. Prisma 7 recibe además el connection string en el
adapter de `api/_lib/prisma.js`.

En desarrollo:

```bash
npm run db:migrate
```

En staging y producción:

```bash
npm run db:migrate:deploy
```

No editar una migración ya aplicada. Crear una migración correctiva.

No ejecutar `migrate dev` ni el seed contra staging/producción. Los cambios de schema
viajan por `.github/workflows/migrate.yml`.

La URL de Supabase debe ser una conexión válida del pooler. Un `P1000` en Vercel indica
credenciales incorrectas en el `DATABASE_URL` del entorno de runtime; es independiente
del secret usado por GitHub Actions para migrar.

## Variables de entorno

Consultar `.env.example` y `docs/BLOQUE-2-ENTORNOS.md`.

Puntos delicados:

- `SUPABASE_SERVICE_ROLE_KEY` solo existe en servidor.
- Las variables `VITE_*` se exponen al navegador.
- `APP_URL` es el destino de las invitaciones y debe ser estable y estar permitido en
  Supabase Auth.
- Preview y Production tienen valores independientes en Vercel.
- cambiar variables de Vercel requiere redesplegar;
- Vercel y GitHub Actions guardan secretos por separado.

## Desarrollo y tests

```bash
npm install
npm run dev:api
npm test
npm run test:coverage
npm run build
```

Convenciones:

- lógica de negocio separada de IO;
- dependencias inyectables en handlers;
- usar `api/_lib/testFakePrisma.js` en tests, no conectar CI a Supabase;
- evitar `vi.mock` cuando puede inyectarse el cliente;
- toda feature nueva lleva tests;
- mantener cobertura global por encima del 90%;
- preservar el aislamiento tenant en caché, API y base de datos;
- no introducir datos demo en el frontend: viven en `prisma/seed.js`.

## Decisiones que no deben revertirse accidentalmente

- `pptxgenjs` permanece en 3.12: la rama 4.x dio problemas de carga en Vercel.
- Los datos validados del análisis se formatean directamente en la presentación; Claude
  solo sintetiza tagline y resumen final.
- La unicidad de expediente es por organización, no global.
- `requireMember` complementa a `requireUser`; no lo sustituye en el bootstrap
  `GET /api/orgs` ni en la aceptación de invitaciones.
- El token de invitación no se devuelve al owner. Solo viaja en el enlace enviado al
  invitado y se retira de la URL antes de canjearse.
