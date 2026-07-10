# CLAUDE.md — TCCT Pliegos

> Contexto persistente para trabajar con Claude en el proyecto **Analizador de Pliegos** de Telefónica Cybersecurity & Cloud Tech (TCCT). Pegar en el próximo chat o dejar en la raíz del repo.

---

## 1. Quién y qué

**Jaime**, presales/bid management en TCCT. Trabajo diario: responder licitaciones públicas (pliegos PPT + PCAP) y automatizar tareas presales con IA.

**Ecosistema**: Yirah, JC (manager), Laura Fdez, María Moríñigo, Octavio (equipo interno); Mónica Cuadrado, Nieves Vega, Oficina Eficiencia (externo); Bea (Compras).

**Dominio**: contratación pública española (ENS, CCN-STIC, GISS/Seguridad Social como cliente clave), ciberseguridad (Fortinet, Cisco UCS, VMware, CrowdStrike, Qualys, XDR/SOAR/EDR/ASM), documentación RFP.

---

## 2. El proyecto

**Nombre**: TCCT Pliegos · Presales Suite
**Objetivo**: automatizar la extracción estructurada de datos de expedientes de licitación pública, para acelerar el bloque "Dispatching" y "Diseño Solución" del Presales Journey de TCCT.

**Origen**: análisis del "Presales Journey" (5 bloques secuenciales — Dispatching → Diseño Solución → Business Case → Presentación Oferta → Post Venta). Se identificaron 10 cuellos de botella; se priorizó el **lector de pliegos** como quick win por dos motivos: (1) es el trabajo diario actual de Jaime con el expediente 2026/7008 de GISS, (2) input y output cerrados (PDF entra, JSON estructurado sale) — no requiere integración con Salesforce/SHERPA/Outlook para arrancar.

**Estrategia comercial interna**: enseñar mockup a JC para vender la idea antes de invertir en la parte funcional. La demo visual pesa más que un diagrama técnico.

---

## 3. Decisiones tomadas

| Decisión | Motivo |
|---|---|
| **Descartado Flowise** para este caso | Dependencia de infra corporativa, curva de aprobación IT, demo poco vendible internamente. Se reserva para casos futuros. |
| **Frontend propio en React** | Control total del prompt engineering, iteración rápida, deploy en Vercel sin infra, demo directamente compartible con URL. |
| **Mockup visual primero (mock data)** | Validar UX con JC antes de gastar tiempo en el LLM real. |
| **Dos pantallas**: dashboard + análisis detallado | Suficiente para vender la idea; ampliable después. |
| **Estilo Telefónica Tech corporativo** | Se pega a la identidad de la empresa para transmitir producto interno de verdad, no POC de fin de semana. |
| **Vista de comparativa entre pliegos descartada por ahora** | Se prioriza conectar la extracción real (API) antes de seguir ampliando el mockup visual. Sigue en el backlog corto plazo, no eliminada. |
| **API de extracción: Anthropic Claude** | Se migra desde OpenAI por fallo de cuota/billing en la API key de OpenAI. |
| **Persistencia real: Supabase (Postgres) + Prisma** | Jaime decide "tomarse en serio" el proyecto — pasar de `useState`/mock a un backend sólido. Supabase en vez de Vercel Postgres porque da Auth/Storage de serie para más adelante. |
| **TanStack Query para el estado de servidor en frontend** | Evita reinventar cache/loading/error a mano según crece la app; sustituye a los `useState`+handlers dispersos de hoy. |
| **`analysisData` como columna JSON, sin normalizar en tablas** | Minimiza la reescritura del shape que ya consume `Analysis`; se normaliza más adelante solo si hace falta analítica cruzada entre pliegos. |

---

## 4. Estado actual (06/07/2026)

**Entregado**:
- Repo `tcct-pliegos` en GitHub (`jaimerabazo/tcct-pliegos`), con `main` ya desplegado.
- Mockup funcional en React (Vite + React 18 + Tailwind 3 + lucide-react + Google Fonts precargadas).
- `feat/upload-pdf` (mergeada): modal de upload con drag & drop del PDF.
- `feat/connect-api` (implementada y **confirmada funcionando con un pliego real**, pendiente de PR/merge): extracción real vía **API de Anthropic Claude**.
  - `api/analyze.js` (Vercel Function, Node): recibe el PDF en crudo, lo envía a Claude como bloque `document` en base64, llama a `messages.create()` con `model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'` y `output_config.format: json_schema` (Structured Outputs) para forzar un JSON con el mismo shape que `MOCK_ANALYSIS`. `max_tokens: 20000`, `maxDuration: 300` (también fijado en `vercel.json` porque `export const config` no bastó en el runtime de Vercel).
  - `UploadModal` ya no simula el progreso: hace `fetch('/api/analyze', ...)` de verdad, rota los mensajes de `UPLOAD_STEPS` mientras espera (barra indeterminada, no hay % real) y tiene un estado de error con "Reintentar" / "Elegir otro archivo".
  - `MOCK_PLIEGOS` pasó a vivir en `useState` dentro de `App`; cada análisis real se añade como fila nueva (`estado: 'analizado'`, con `analysisData` colgando del propio pliego) y `Analysis` prioriza `pliego.analysisData` sobre el mock.
  - Se corrigió un bug preexistente en el ribbon de `Analysis`: "Duración" y "Cierre de ofertas" estaban hardcodeados a los valores de 2026/7008; ahora se derivan de `data.resumen`/`data.plazos` (solo se notaba con datos reales distintos).
  - Migrado de OpenAI a Anthropic Claude por fallo de cuota/billing en la API key de OpenAI (ver §3). Jaime ya probó `vercel dev` en local con un pliego real y `ANTHROPIC_API_KEY`, y la extracción funciona.

**En marcha — iniciativa "full-stack sólido"** (rama `feat/api-rest`), 4 fases (ver plan de la iniciativa):
- [x] **Fase 1 — Prisma + Supabase**: modelo `Pliego` (`prisma/schema.prisma`), migración aplicada y seed de los 6 pliegos demo corrido contra la BD real de Supabase. Ver §5 y §9 para los detalles/gotchas de Prisma 7 que costó descubrir.
- [x] **Fase 2 — API REST** (`/api/pliegos`):
  - `GET /api/pliegos` (`api/pliegos/index.js`), `GET`/`PATCH /api/pliegos/[id]` (`api/pliegos/[id].js`), `PATCH /api/pliegos/[id]/analysis` (`api/pliegos/[id]/analysis.js`). `api/analyze.js` ahora persiste el resultado (`prisma.pliego.upsert` por `expediente`, así que re-analizar el mismo expediente actualiza en vez de duplicar) en lugar de solo devolver el JSON de Claude.
  - Validación con **Zod** (`api/_lib/schemas.js`): `pliegoPatchSchema` (cabecera, parcial), `analysisDataSchema` (mismo shape que `PLIEGO_ANALYSIS_SCHEMA` de Claude, pero en Zod — se repite el contrato porque JSON Schema y Zod son DSLs distintos, no se puede compartir el objeto literal), `pliegoFromAnalysisSchema` (valida lo que devuelve Claude antes de persistir, defensa en profundidad aunque el `json_schema` de Structured Outputs ya debería garantizarlo).
  - **Patrón de testing**: igual que `prisma/seed.js`/`seed.test.js` (ya establecido por Jaime) — nada de `vi.mock`. Cada handler exporta su lógica núcleo recibiendo el cliente Prisma por parámetro (`listPliegos(client)`, `getPliego(client, id)`, etc.) y el `handler` por defecto acepta un tercer argumento opcional `client = prisma` (Vercel siempre lo llama con 2, así que en producción cae al singleton real; los tests le pasan un doble). Doble de Prisma en memoria compartido en `api/_lib/testFakePrisma.js` (soporta `findMany`/`findUnique`/`update`/`create`/`upsert`, lanza `P2025` si no encuentra el registro, igual que Prisma de verdad).
  - 101 tests, 100% cobertura en `src/logic.js` + `api/_lib/schemas.js` + los 3 handlers de `api/pliegos/*` (ampliado en `coverage.include`). El `handler` de `api/analyze.js` en sí (la llamada real a Claude) sigue sin test unitario — mismo criterio que `main()` en `seed.js`: se verifica a mano, no por CI. Sí se testean las funciones nuevas que añade esta fase (`toPliegoRowFromAnalysis`, `persistAnalysis`).
  - Verificado a mano contra la BD real de Supabase (no solo con el doble): `listPliegos`/`getPliego`/`updatePliego` ejecutados contra un pliego real de la BD.
- [ ] Fase 3 — Reestructurar `App.jsx` en `src/api|components|views` + conectar con TanStack Query, eliminando `MOCK_PLIEGOS`/`MOCK_ANALYSIS` del frontend (pasan a vivir solo en `prisma/seed.js`).
- [ ] Fase 4 — CI (GitHub Actions) + ampliar `coverage.include`.

**Pendiente inmediato**: Fase 3 (reestructurar frontend + TanStack Query). Aparte, sigue abierto el PR de `feat/connect-api` a `main`, y el resto del backlog corto plazo (vista de comparativa, ajustar mocks, histograma).

**Aviso registrado**: URL de Vercel es pública por defecto. Ahora que la extracción es real (aunque sea con archivos de prueba), conviene activar Vercel Password Protection o SSO antes de compartir la URL ampliamente. Límite conocido: las Vercel Functions (Node) aceptan payloads de ~4.5MB; pliegos grandes o escaneados pueden fallar.

---

## 5. Stack técnico

```
Vite 5           bundler y dev server
React 18         UI
Tailwind CSS 3   styling utility-first
lucide-react     iconografía outline
Google Fonts     Space Grotesk + Inter + JetBrains Mono
Vitest 4         test runner (+ @testing-library/react, jsdom)
```

**Testing**: `npm run test` (una vez), `npm run test:watch`, `npm run test:coverage`. La lógica de negocio pura vive en `src/logic.js` (formateo, `computeDashboardKpis`, `getLotesSumMismatch`) con tests en `src/logic.test.js` — umbral de cobertura ≥90% (líneas/funciones/branches/statements) configurado en `vitest.config.js`, acotado por ahora a `src/logic.js` + `api/_lib/schemas.js` + los handlers de `api/pliegos/*` (`coverage.include`). Regla acordada con Jaime: **toda feature nueva debe llevar tests con ≥90% de cobertura** de su lógica; se amplía el `include` según se vayan cubriendo más partes. Patrón de testing para el backend: inyección del cliente Prisma por parámetro (nunca `vi.mock`), con un doble en memoria en `api/_lib/testFakePrisma.js` — ver §10 Fase 2 para el detalle. `src/Dashboard.test.jsx` y `src/Analysis.test.jsx` son tests de integración ligeros con React Testing Library (no cuentan para el umbral, son un plus).

**Backend**: `api/analyze.js`, función serverless de Vercel (Node, `@anthropic-ai/sdk`). Envía el PDF a Claude como `document` base64 y usa `messages.create()` con `output_config.format: json_schema` para la extracción, valida el resultado con Zod (`api/_lib/schemas.js`) y lo persiste (`prisma.pliego.upsert` por `expediente`). Requiere `ANTHROPIC_API_KEY` como variable de entorno (local: `.env.local` + `vercel dev`; producción/preview: Vercel dashboard). `ANTHROPIC_MODEL` es opcional; por defecto usa `claude-sonnet-5`. API REST completa en `api/pliegos/` (listar, obtener, actualizar cabecera, actualizar análisis) — ver §10 Fase 2. El frontend (`src/App.jsx`) todavía no consume ninguno de estos endpoints; sigue con `MOCK_PLIEGOS`/`MOCK_ANALYSIS` hasta la Fase 3.

**Base de datos**: Supabase (Postgres) + Prisma 7 (`prisma/schema.prisma`, modelo único `Pliego` con `analysisData Json?`). Un par de cosas no obvias de Prisma 7 que costó descubrir, para no volver a perder tiempo:
- **La conexión "Direct" de Supabase es IPv6-only** (sin registro DNS A, solo AAAA) salvo que pagues el add-on de IPv4 — inalcanzable desde Vercel y desde muchos entornos de desarrollo. Hay que usar el **connection pooler** (Supabase dashboard → Settings → Database → "Session pooler", host `*.pooler.supabase.com`, puerto 5432) como `DATABASE_URL`.
- **Prisma 7 eliminó `url` del bloque `datasource` del schema** — ya no se puede hacer `url = env("DATABASE_URL")`. La URL para Migrate/Studio vive en `prisma.config.ts` (`datasource.url`), pero el `PrismaClient` en tiempo de ejecución necesita su propia conexión vía un **driver adapter** explícito: `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })` (paquete `@prisma/adapter-pg` + `pg`). Ver `api/_lib/prisma.js` (singleton) y `prisma/seed.js`.
- `prisma.config.ts` carga `.env.local` explícitamente (no `.env`, que es el default de Prisma) para ser coherente con dónde vive `ANTHROPIC_API_KEY`.
- Generador elegido: **`prisma-client-js`** (el clásico, no el nuevo `prisma-client` que Prisma 7 pone por defecto y genera `.ts`) — este proyecto es JS puro, así evitamos meter un loader de TypeScript solo para el cliente de Prisma.
- `prisma/seed.js` puebla los 6 pliegos demo (idempotente, `upsert` por `expediente`); correrlo con `npm run db:seed`.

---

## 6. Diseño y branding

**Paleta** (única, sin acentos secundarios):
```
--tt-blue          #0066FF   Protagonista, CTAs, badges principales
--tt-blue-dark     #0044CC   Hover / active
--tt-blue-light    #F0F5FF   Fondos suaves de acento
--tt-navy          #001B4B   Texto principal, avatares
--tt-gray          #5B6478   Texto secundario, iconos inactivos
--tt-border        #E5E9F0   Bordes de tarjetas y tablas
--tt-surface       #F5F7FA   Fondos de sidebar y áreas neutras
```

Estados: verde #00A67C (analizado), naranja #F5A623 (revisión), rojo #E24B4A (error), azul TT con pulse (procesando).

**Tipografía**:
- **Space Grotesk** (500 principalmente) — display, títulos, KPIs, números de categorías. Geométrica, moderna, cercana al feel de Movistar Text sin infringirla.
- **Inter** (400/500) — body y microcopy.
- **JetBrains Mono** (500) — nº expediente, códigos CPV, códigos de perfiles STS, importes. **Signature element del producto**.

**Elementos distintivos**:
1. **Nº expediente en mono azul TT** omnipresente — trata el pliego oficial como un objeto de datos estructurados.
2. **Ribbon de metadatos** debajo del título del análisis (importe, lotes, duración, cierre) — mimetiza cabecera de documento oficial.
3. **Índice de confianza** (`● 98%`) junto a cada dato extraído — transmite transparencia sobre el LLM y da al usuario señal de qué campos revisar manualmente.
4. **Botón "Generar borrador RFP"** en toolbar del análisis — puente visible al siguiente caso de uso, aunque no hace nada aún.

---

## 7. Estructura de datos mock

**Dashboard**: 6 expedientes en `MOCK_PLIEGOS`:
1. `2026/7008` — GISS · Soporte Técnico de Sistemas (18.5M€, 3 lotes) — **el real que Jaime trabaja**
2. `2026/4521` — AGE Interior · Modernización EDR/XDR (4.5M€, 1 lote)
3. `2026/2145` — Min. Justicia · Renovación Fortinet (3.1M€, 1 lote)
4. `2026/5210` — Ajuntament Barcelona · Ciberseguridad municipal (6.2M€, 1 lote)
5. `2026/3892` — INAP · Plataforma SOAR (2.8M€, 2 lotes)
6. `2026/6034` — Junta Andalucía · Auditoría ENS Alto (1.8M€, 1 lote)

**Análisis detallado**: solo el 2026/7008 tiene datos ricos en `MOCK_ANALYSIS`; los demás caen a él como fallback (intencional para demo). Estructura del análisis:

```
resumen        objeto, CPV, procedimiento, duración, prórrogas
lotes          3 lotes (Producción/Sistemas/Comunicaciones) con importe + CPV + confianza
perfiles       5 categorías STS (TSSX/TSSA/TSSB/TSSC/TMSA), 40 recursos totales
solvencia      técnica (experiencia, volumen 20M€, ISO 27001/20000/9001, ENS Alto) + económica (RC 3M€, capital 5M€)
criterios      5 criterios con pesos (40% precio + 25% metodología + 20% equipo + 10% transición + 5% mejoras)
penalizaciones retraso hito, incumplimiento SLA, confidencialidad
plazos         cierre 15/07/2026, hitos del contrato (kickoff, fin transición, revisión SLA, plantillas críticas)
marco          ENS Alto, CCN-STIC 803/804/810/811, RGPD, LOPDGDD, RD 311/2022
```

---

## 8. Estructura del proyecto

```
tcct-pliegos/
├── api/
│   ├── analyze.js              Vercel Function: envía el PDF a Claude, valida y persiste el resultado
│   ├── analyze.test.js
│   ├── pliegos/
│   │   ├── index.js            GET /api/pliegos (listar)
│   │   ├── index.test.js
│   │   ├── [id].js             GET/PATCH /api/pliegos/[id] (uno / actualizar cabecera)
│   │   ├── [id].test.js
│   │   └── [id]/
│   │       ├── analysis.js     PATCH /api/pliegos/[id]/analysis (actualizar analysisData)
│   │       └── analysis.test.js
│   └── _lib/
│       ├── prisma.js           Cliente Prisma singleton (driver adapter @prisma/adapter-pg)
│       ├── schemas.js          Schemas Zod (pliegoPatchSchema, analysisDataSchema, pliegoFromAnalysisSchema)
│       ├── schemas.test.js
│       ├── testFakePrisma.js   Doble en memoria de PrismaClient para tests (findMany/findUnique/update/create/upsert)
│       └── testFakeRes.js      Doble mínimo del objeto `res` de Vercel para tests
├── prisma/
│   ├── schema.prisma           Modelo Pliego (analysisData como Json)
│   ├── seed.js                 Puebla los 6 pliegos demo (idempotente); exporta MOCK_PLIEGOS/MOCK_ANALYSIS
│   ├── seed.test.js
│   └── migrations/
├── prisma.config.ts            Config de la CLI de Prisma (lee .env.local)
├── index.html                  Carga Google Fonts en <head>
├── package.json                deps: react 18, lucide-react, tailwind 3, vite 5, @anthropic-ai/sdk, prisma, zod
├── vite.config.js              plugin-react
├── tailwind.config.js          extend con paleta tt-*
├── postcss.config.js           tailwind + autoprefixer
├── .gitignore
├── README.md                   instrucciones de despliegue
└── src/
    ├── main.jsx                entry ReactDOM
    ├── index.css               @tailwind directives + @keyframes pulse + @keyframes indeterminate
    ├── generated/prisma/       Cliente Prisma generado (gitignored, se regenera con `prisma generate`/postinstall)
    └── App.jsx                 TODO el componente de frontend en un solo archivo (~1050 líneas) — se reestructura en la Fase 3
```

**`api/analyze.js`** (Node, runtime Vercel, `maxDuration: 300`):
- Lee el PDF como cuerpo binario crudo (`Content-Type: application/pdf`, nombre en cabecera `X-Filename`), sin multipart ni base64.
- `anthropic.messages.create({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5', ... })` con `output_config.format: { type: 'json_schema', schema: PLIEGO_ANALYSIS_SCHEMA }` (mismo shape que `MOCK_ANALYSIS` + un bloque `pliego` para la fila del dashboard).
- Valida la respuesta con `pliegoFromAnalysisSchema`/`analysisDataSchema` (Zod, defensa en profundidad) y la persiste con `persistAnalysis()` (`prisma.pliego.upsert` por `expediente` — reanalizar el mismo expediente actualiza, no duplica). Devuelve la fila persistida (con `id` real de la BD) o `{ error }`. No usa Files API; el PDF viaja en base64 en la misma request a Claude.

**`api/pliegos/*`**: cada handler exporta su lógica núcleo recibiendo el cliente Prisma por parámetro (`listPliegos(client)`, `getPliego(client, id)`, `updatePliego(client, id, patch)`, `updateAnalysis(client, id, analysisData)`) y el `handler` por defecto acepta un tercer argumento opcional `client = prisma` — así los tests inyectan el doble de `api/_lib/testFakePrisma.js` sin `vi.mock` (Vercel siempre llama con 2 argumentos, así que en producción cae al singleton real). `PATCH` valida el body con los schemas Zod correspondientes antes de tocar la BD; un `P2025` de Prisma (registro no encontrado) se traduce a 404.

**`src/App.jsx`** contiene:
- Constantes `MOCK_PLIEGOS` y `MOCK_ANALYSIS` al inicio — siguen siendo el fallback/demo para expedientes no analizados aún vía API.
- Helpers `formatEuro`, `formatEuroFull`, `formatShortDate`, `slugify`, `StatusBadge`, `ConfidenceBadge`.
- Subcomponentes: `Sidebar`, `KpiCard`, `Dashboard`, `SectionCard`, `SectionTitle`, `Analysis`, `UploadModal`.
- Constante `SECTIONS` con el índice del análisis (7 secciones).
- Constante `UPLOAD_STEPS` con los mensajes que rota `UploadModal` mientras espera la respuesta real de `/api/analyze`.
- Componente raíz `App`: `pliegos` en `useState` (arranca con `MOCK_PLIEGOS`, se le añaden los análisis reales), navegación `view`/`selectedPliego`, `showUploadModal`.

**No usa (todavía)**: routing library (solo state), autenticación, localStorage/sessionStorage. Ya usa backend (`api/analyze.js`) y base de datos real (Supabase vía Prisma, ver §5) desde la Fase 1 de la iniciativa full-stack — el frontend aún no la consume (eso es la Fase 3).

---

## 9. Cómo desarrollar y desplegar

**Local (solo frontend, sin extracción real)**:
```bash
npm install
npm run dev        # → http://localhost:5173
```

**Local con extracción real** (necesario para probar el modal de "Nuevo análisis" de verdad):
```bash
npx vercel link       # una vez
npx vercel env pull   # o crear .env.local con ANTHROPIC_API_KEY=sk-ant-...
npm run dev:api       # = vercel dev, sirve frontend + /api juntos
```

**Base de datos (Supabase + Prisma)**:
```bash
npm run db:migrate   # prisma migrate dev — aplica el schema contra DATABASE_URL
npm run db:seed      # puebla los 6 pliegos demo (idempotente)
npm run db:studio    # explorador visual de la BD (prisma studio)
```
`DATABASE_URL` va en `.env.local` — **usar el "Session pooler" de Supabase** (host `*.pooler.supabase.com`, puerto 5432), no la conexión "Direct" (es IPv6-only, inalcanzable desde aquí y desde Vercel). Ver §5 para más detalle de por qué.

**Deploy Vercel**:
1. Push a un repo de GitHub (`tcct-pliegos`, público o privado).
2. vercel.com → Add New → Project → import repo → Deploy.
3. Añadir en Settings → Environment Variables (Production + Preview): `ANTHROPIC_API_KEY` (opcional `ANTHROPIC_MODEL`) y `DATABASE_URL` (el mismo connection string del pooler de Supabase) — sin ellas `/api/analyze` y cualquier endpoint que use Prisma fallan.
4. URL pública en 90s tipo `tcct-pliegos-xxx.vercel.app`.
5. Cada `git push` a `main` = redeploy automático. `postinstall: prisma generate` corre solo en cada build.

---

## 10. Backlog identificado

**Corto plazo (iteración de mockup)**:
- [x] Modal de upload con drag & drop del PDF — implementado en rama `feat/upload-pdf`. Valida que sea PDF, simula progreso de extracción por pasos y al terminar abre el análisis completo de 2026/7008 (no procesa el PDF real, sigue siendo mock).
- [ ] Ajustar los mock del 2026/7008 con datos más cercanos a los reales de Jaime.
- [ ] ~~Vista de comparativa entre dos pliegos.~~ Aparcada mientras se trabaja `feat/connect-api`; retomar después.
- [x] Histograma de importes por organismo en dashboard — barras horizontales (una por organismo, agregando `importe` si se repite), ordenadas de mayor a menor, bajo la tabla de expedientes.
- [x] KPI "Tiempo medio de extracción" sustituida por "Importe medio" (junto a "Importe agregado"), por ser más accionable para presales.
- [x] Edición manual de los campos de análisis — botón "Editar" por sección (no global) en cada `SectionCard` de `Analysis`, con "Guardar"/"Cancelar". Al guardar `lotes`/`perfiles`, la confianza de esas filas pasa a 100% (verificado por humano). Sin backend todavía: los cambios viven en el estado de React de `App` (`onUpdateAnalysis` actualiza `pliegos` y `selectedPliego`), sobreviven navegando dashboard↔análisis en la sesión, se pierden al recargar. No cubre añadir/quitar filas ni los campos de cabecera (`pliego.importe`, `pliego.lotes`, etc.) — posible fast-follow.
- [x] KPIs del dashboard reactivas — dejaron de ser strings hardcodeadas; ahora `computeDashboardKpis` (`src/logic.js`) calcula recuento, importe agregado, importe medio y confianza media a partir de `pliegos` en tiempo real. Confianza media solo promedia pliegos con `analysisData` real; si no hay ninguno, cae al 94% demo. Cubierto con tests (`src/logic.test.js`, `src/Dashboard.test.jsx`).
- [x] Aviso de descuadre lotes↔importe — `getLotesSumMismatch` (`src/logic.js`) compara `sum(lotes[].importe)` contra `pliego.importe` y pinta un banner de aviso (no bloqueante) en la sección Lotes, tanto en lectura como en vivo mientras se edita. El "Importe total del pliego" (el del ribbon de cabecera, `pliego.importe`) ahora también es editable — se añadió como campo dentro del propio formulario de "Lotes" (no en el ribbon ni como sección aparte), porque es justo donde vive la comprobación. Al guardar, `onUpdatePliego` (nuevo, en `App`) actualiza `pliego.importe` por separado de `onUpdateAnalysis` (que actualiza `lotes`); ambos se reflejan también en la fila del Dashboard. Cubierto con tests (`src/logic.test.js`, `src/Analysis.test.jsx`).

**Medio plazo (versión funcional)**:
- [x] Conectar a la **API de Anthropic Claude** para la extracción — implementado en rama `feat/connect-api` (`api/analyze.js`, modelo configurable por `ANTHROPIC_MODEL`, PDF base64 + `messages.create()` + Structured Outputs). **Probado con un pliego real y confirmado que funciona.** Pendiente de PR/merge a `main`.
- [x] Backend mínimo (Vercel Functions) para no exponer la API key — hecho como parte de lo anterior.
- [ ] Exportación real a Excel (SheetJS/xlsx).
- [ ] Persistencia de análisis (Postgres/Supabase o similar).
- [ ] Revisar el límite de ~4.5MB de payload de las Vercel Functions si da problemas con pliegos reales grandes/escaneados (alternativa: subida directa navegador→Anthropic Files API o almacenamiento intermedio).

**Largo plazo (institucionalización)**:
- [ ] SSO Telefónica.
- [ ] Subdominio corporativo TCCT.
- [ ] Integración con Salesforce (auto-abrir análisis al recibir el pliego en un caso).
- [ ] Integración con Outlook / Power Automate (trigger cuando llega correo del organismo).
- [ ] Botón "Generar borrador RFP" funcional (caso de uso #3 del backlog original).

---

## 11. Contexto adicional del Presales Journey

Los 5 bloques del flujo TCCT y los cuellos de botella identificados (por si el próximo chat va sobre otro caso de uso):

1. **Dispatching** — bandeja triaje, análisis de la necesidad, evaluación cargabilidad, asignación ingeniero. Cuellos: triaje manual, comunicación OB atascada. Herramientas: Outlook, Consola Triaje.
2. **Diseño Solución** — requerimientos, Tech Solution Book/SAGA, arquitectura, cotización proveedores. Cuellos: búsqueda manual en repositorios, redacción RFP a proveedor.
3. **Construcción Business Case** — cotización manual + SHERPA, Comité de Ofertas, recotización. Cuellos: llenar SHERPA (no automatizable con LLM), evaluar si va a CdO.
4. **Presentación Oferta** — OTE, preciarios, DEUC, casos éxito, certificaciones, CVs, defensa con cliente. Cuellos: documentación repetitiva.
5. **Post Venta** — correlación caso-oferta, kickoff tramitación, resolución escalados.

**Casos especiales**: Big Deals (flujo extendido con equipo, kick-off, plantillas y modelos de gobierno), Ofertas multitorre, Filiales (ACENS/AS/TGT → GV/AC).

**Ranking de próximos casos de uso** (después del lector de pliegos):
1. Generador de borradores de RFP sección 2.1 (workstream actual de Jaime).
2. RAG sobre Tech Solution Book + SAGA + ofertas históricas.
3. Selector automático de casos éxito + CVs por sector/tecnología del cliente.

---

## 12. Convenciones y preferencias de Jaime

- **Comunicación**: informal/coloquial en chat (español, abreviaciones, algún emoji), pero espera outputs profesionales (documentos, código, Excel).
- **Iteración**: incremental, paso a paso. Prefiere implementar él mismo con guía que recibir soluciones cerradas.
- **Excel**: locale español (`BUSCARX`, `EXTRAE`, `SI.CONJUNTO`, Power Query). Versionado explícito (`_vX.xlsx`).
- **Escalación**: soft first contact, autoridad del manager como fallback.
- **Framing licitaciones**: distingue *nueva necesidad / renovación / ampliación* — cambia el tono del documento.
- **Introducciones RFP**: estructura de tres párrafos (contexto/objeto → alcance técnico → continuidad/soporte del proveedor).

---

## 13. Filosofía de trabajo acordada en el proyecto

1. Vender internamente la UX antes de invertir en la parte funcional.
2. Feedback temprano de JC prima sobre perfección técnica.
3. Iteración rápida: cambio en `App.jsx` → `git push` → Vercel redespliega solo.
4. Cuando se hable con managers, el mockup manda. Cuando se implemente, el JSON schema manda.
5. Cada caso de uso resuelto abre el siguiente (RFP generator, RAG Tech Solution Book, selector casos éxito).

---

*Última actualización: 06/07/2026 · Fase actual: mockup desplegado en Vercel, modal de upload mergeado a `main`. Extracción real vía API de Anthropic Claude en `feat/connect-api`, **confirmada funcionando con un pliego real**, pendiente de PR/merge a `main`. Vista de comparativa entre pliegos aparcada mientras tanto.*
