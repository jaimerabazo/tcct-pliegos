# Bloque 2 — Entornos, CI/CD y ciclo de vida de las migraciones

> De "una BD para todo" a dev/staging/prod con migraciones que viajan solas y con las
> manos fuera de producción. Mitad lección, mitad runbook: las tareas de dashboard son
> de Jaime (🧑‍💻), las de repo ya están hechas en este bloque (🤖).
>
> Estado: **en ejecución** (16/07/2026). Región confirmada del proyecto actual: **Irlanda
> (eu-west-1) ✅** → sirve como `dev` sin recrear.

---

## 0. Realidad del plan gratuito: 2 entornos, no 3 (decisión 21/07/2026)

El plan free de Supabase permite **2 proyectos**. El ideal de 3 entornos exige Supabase
Pro (~25€/mes). Pre-lanzamiento y sin clientes, pagarlo es quemar caja por un lujo que
aún no se usa. **Decisión consciente y documentada** (lección de founder: recortar a
propósito, no por descuido):

- **dev** = proyecto actual (local).
- **staging** = proyecto nuevo. Por ahora es el ÚNICO entorno "vivo": sirve la preview de
  `develop` y —cuando haya URL pública— también la producción de Vercel.
- **prod** = **APLAZADO**. Disparador para crearlo: **primer piloto de pago** → subir a
  Supabase Pro, crear el proyecto prod y repuntar Vercel prod ahí. El pipeline ya lo
  soporta: el job `migrate-production` se salta en verde mientras no exista su secret.

Coste del recorte, honesto: hasta ese día no hay un "ensayo en staging antes de prod"
real — staging ES el entorno vivo. Aceptable sin usuarios reales; deja de serlo el día
del primer cliente (por eso ese día es el disparador).

---

## 1. La lección: por qué existen los entornos

**Radio de explosión (blast radius).** Cada entorno es un cortafuegos: un error en dev
te cuesta un `git checkout`; en staging, un redeploy; en prod, clientes y reputación.
El objetivo del diseño es que **la distancia entre "me he equivocado" y "lo ha notado un
cliente" tenga dos puertas por medio**.

```
dev        tu máquina + Supabase "dev" (el proyecto ACTUAL, Irlanda)
           → datos falsos (seed), se puede romper sin pedir perdón

staging    Vercel Preview (rama develop) + Supabase "staging" (nuevo, Irlanda)
           → réplica de prod SIN datos reales; aquí ensayan las migraciones

production Vercel Production (rama main) + Supabase "prod" (nuevo, Irlanda)
           → sagrado: nadie ejecuta nada a mano contra él. Nunca. Ni tú.
```

**Regla de oro**: si quieres tocar prod, el camino es `código → PR → develop (staging) →
PR → main (prod)`. La pereza de ese camino es el precio del cortafuegos.

---

## 2. La lección: el ciclo de vida de una migración

Dos comandos de Prisma que parecen hermanos y son opuestos:

| Comando | Qué hace | Dónde se usa |
|---|---|---|
| `prisma migrate dev` | **Genera** una migración nueva comparando schema.prisma con la BD, y la aplica | SOLO en dev, SOLO tú |
| `prisma migrate deploy` | **Aplica** las migraciones ya generadas (carpeta `prisma/migrations`), sin generar nada | staging y prod, SOLO el CI |

El flujo completo de un cambio de schema:

```
1. Editas schema.prisma en tu rama
2. npm run db:migrate            → genera prisma/migrations/XXXX_nombre/ y la aplica a dev
3. Commit (¡la migración es código y va al repo!) → PR a develop
4. CI: tests → merge → el workflow aplica `migrate deploy` a STAGING automáticamente
5. Pruebas en staging (la app de preview apunta ahí)
6. PR develop → main → merge → el workflow pide TU APROBACIÓN → aplica a PROD
```

**Drift**: si alguien toca el schema desde el editor SQL de Supabase, la BD y la carpeta
de migraciones divergen y `migrate deploy` acabará fallando o mintiendo. Por eso: el
schema SOLO cambia vía migraciones. El editor SQL de Supabase queda para LEER.

---

## 3. La lección estrella: expand & contract (migraciones sin romper nada)

Vercel despliega el código y el CI aplica la migración **en paralelo** — no hay garantía
de orden. Y durante un deploy conviven segundos (o minutos) de código viejo con schema
nuevo, o viceversa. La disciplina que lo hace seguro:

**Nunca una migración que rompa el código que está corriendo.** Todo cambio destructivo
se parte en fases compatibles:

```
Ejemplo: renombrar la columna `titulo` → `nombre`

❌ MAL (una migración):  RENAME COLUMN titulo TO nombre
   → durante el deploy, el código viejo pide `titulo` → 500s en producción

✅ BIEN (tres pasos, tres deploys):
   1. EXPAND:   añadir columna `nombre`; el código escribe en AMBAS, lee de `titulo`
   2. MIGRATE:  backfill (copiar titulo→nombre); el código pasa a leer de `nombre`
   3. CONTRACT: cuando nada lee `titulo`, migración que la elimina
```

Suena a burocracia hasta el día que te ahorra el primer incendio. Regla mnemotécnica:
**añadir es gratis, quitar es un proyecto**. (Añadir columnas nullable, tablas nuevas,
índices: seguro en un paso. Renombrar, cambiar tipos, borrar: expand & contract.)

---

## 4. Mapa de variables por entorno

| Variable | dev (.env.local) | staging (Vercel Preview + GH secret) | prod (Vercel Prod + GH secret) |
|---|---|---|---|
| `DATABASE_URL` (pooler) | Supabase dev | Supabase staging | Supabase prod |
| `SUPABASE_JWT_SECRET` | dev | staging | prod |
| `VITE_SUPABASE_URL` | dev | staging | prod |
| `VITE_SUPABASE_ANON_KEY` | dev | staging | prod |
| `ANTHROPIC_API_KEY` | key "dev" ⚠️ | key "staging" | key "prod" |
| `ANTHROPIC_MODEL` | (opcional) | (opcional) | (opcional) |

⚠️ **Keys de Anthropic separadas con límite de gasto** en la de dev/staging (Console →
Billing → Spend limits): un bucle infinito en desarrollo no puede costarte el
presupuesto del mes. Esto es control de blast radius aplicado al COGS.

**Dos almacenes de secretos, dos consumidores** (fuente de confusión clásica):
- **Vercel env vars** → los lee la APP desplegada (functions + build del frontend).
- **GitHub Actions secrets** → los lee el CI (solo necesita `DATABASE_URL_STAGING` y
  `DATABASE_URL_PROD` para las migraciones).

---

## 5. CI/CD resultante

```
PR a develop/main   → ci.yml: tests + cobertura + build (sin BD: dobles en memoria) [ya existía]
push a develop      → migrate.yml: prisma migrate deploy → STAGING (automático)
                    → Vercel despliega preview de develop con env de staging
push a main         → migrate.yml: prisma migrate deploy → PROD
                      ⛔ con GATE: GitHub Environment "production" exige tu aprobación
                    → Vercel despliega producción
```

**El gate de aprobación** (GitHub → Settings → Environments → production → Required
reviewers → tú): aunque estés solo, ese clic consciente antes de tocar la BD de
producción es tu "regla de dos personas" unipersonal. Te obliga a leer QUÉ migración vas
a aplicar. Los incidentes de BD casi nunca vienen de no saber — vienen de no mirar.

**Nota de diseño**: `migrate.yml` está guardado con un check de secrets — hasta que
existan `DATABASE_URL_STAGING`/`DATABASE_URL_PROD` en GitHub, los jobs se saltan con un
aviso en vez de fallar en rojo. El pipeline se activa solo al completar el runbook.

---

## 6. Runbook — tareas de Jaime 🧑‍💻 (en orden, ~45 min)

**Supabase** (con la organización/cuenta actual):
- [x] 1. Renombrar mentalmente el proyecto actual como **dev** (opcional: renombrarlo "pliegos-dev" en Settings → General).
- [x] 2. Crear proyecto **staging** — región **Ireland (eu-west-1)**. Anotar: Project URL, anon key, JWT Secret, y el connection string del **Session pooler** (¡el pooler, no el Direct! — recuerda el gotcha IPv6 de CLAUDE.md §5).
- [~] 3. ~~Crear proyecto **prod**~~ → **APLAZADO** (límite de 2 proyectos del plan free, ver §0). Se crea con el primer piloto de pago, subiendo a Supabase Pro.
- [ ] 4. En staging: Authentication → desactivar "Allow new users to sign up" (mismo estado que dev; el self-service de orgs llega en Bloque 3).

**Anthropic Console**:
- [x] 5. Crear 3 API keys: `pliegos-dev`, `pliegos-staging`, `pliegos-prod`. Límite de gasto bajo en dev/staging (p.ej. 25€/mes).
- [x] 6. Sustituir la key de `.env.local` por `pliegos-dev` (la actual además estaba caducada).

**Vercel** (Settings → Environment Variables):
- [~] 7. ~~**Production** con valores de PROD~~ → APLAZADO con prod (§0). Mientras tanto, Production apunta a STAGING (mismas 5 variables que Preview) si se quiere URL pública ya.
- [x] 8. **Preview** con scope a la rama `develop`: las 5 con valores de STAGING.
- [x] 9. **Development**: valores de dev (o se omite: `.env.local` + `vercel env pull` ya lo cubren).

**GitHub** (repo → Settings):
- [x] 10. Environments → crear `staging` (sin protección) y `production` (**Required reviewers: tú**) — el de production queda creado pero dormido hasta que exista prod.
- [ ] 11. En el environment `staging`: secret `DATABASE_URL` = **Session pooler de staging** . El de `production` se rellena cuando exista prod.
- [x] 12. Comprobar que la rama `develop` existe y está al día con `main`.

**Primer viaje del pipeline (la verificación del bloque)**:
- [ ] 13. Push de este bloque a `develop` → ver en Actions cómo `migrate.yml` aplica el schema a staging (la primera vez aplica TODAS las migraciones: crea las tablas).
- [~] 14-15. ~~Viaje a prod~~ → APLAZADO con prod (§0). La verificación del bloque es que el schema llegue a **staging** (paso 13).

---

## 7. Entregables de repo de este bloque 🤖 (ya hechos)

- `.github/workflows/migrate.yml` — migraciones automáticas con gate de prod y guard de secrets.
- `.env.example` — mapa documentado de variables (el `.env.local` de cada uno se rellena copiándolo).
- `package.json` — script `db:migrate:deploy` (el que usa el CI).

## 8. Reglas que quedan en vigor desde este bloque

1. Prod no se toca a mano. Ni schema (editor SQL), ni datos (seeds), ni deploys manuales.
2. Toda migración pasa por staging antes que por prod, sin excepciones.
3. Cambios destructivos de schema → expand & contract (§3).
4. Secrets: cada entorno los suyos; rotación si hay sospecha; jamás en el repo.
5. `main` siempre desplegable. Si no lo está, arreglarlo es LA prioridad.
