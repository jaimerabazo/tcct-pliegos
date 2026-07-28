# Bloque 2 — Entornos, CI/CD y ciclo de vida de las migraciones

> De "una BD para todo" a dev/staging/prod con migraciones que viajan solas y con las
> manos fuera de producción. Mitad lección, mitad runbook: las tareas de dashboard son
> de Jaime (🧑‍💻), las de repo ya están hechas en este bloque (🤖).
>
> Estado: **CERRADO** (actualizado el 24/07/2026). Región del proyecto actual:
> **Irlanda (eu-west-1) ✅**. Hay dos entornos (dev + staging), prod sigue aplazado y el
> pipeline ha llevado las migraciones del Bloque 3 a staging.

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

> ⚠️ **Nota:** el diagrama de abajo es el modelo IDEAL de 3 entornos. Por el límite del plan
> free de Supabase (§0), **hoy solo existen dev + staging**; el bloque `production` está
> **aplazado** hasta el primer piloto de pago. Se deja aquí como referencia del objetivo.

```
dev        tu máquina + Supabase "dev" (el proyecto ACTUAL, Irlanda)
           → datos falsos (seed), se puede romper sin pedir perdón

staging    Vercel Preview (rama develop) + Supabase "staging" (nuevo, Irlanda)   ← hoy, el entorno vivo
           → aquí ensayan las migraciones

production Vercel Production (rama main) + Supabase "prod"   ← APLAZADO (§0)
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

El cambio de RLS sigue la misma regla: `withTenant` fija siempre `app.org_id`, pero solo
asume `app_tenant` cuando la base confirma que el rol y sus ocho políticas ya existen.
Así el código nuevo es compatible mientras la migración espera la aprobación de
producción; al completarse, RLS se activa automáticamente en la siguiente petición, sin
depender del orden entre Vercel y GitHub Actions. Desde ese momento `SET ROLE` es
obligatorio, por lo que un grant mal configurado falla visiblemente en vez de desactivar
RLS en silencio.

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
| `SUPABASE_URL` | proyecto dev | proyecto staging | proyecto prod |
| `SUPABASE_SERVICE_ROLE_KEY` | proyecto dev | proyecto staging | proyecto prod |
| `SUPABASE_JWT_SECRET` | dev | staging | prod |
| `VITE_SUPABASE_URL` | dev | staging | prod |
| `VITE_SUPABASE_ANON_KEY` | dev | staging | prod |
| `APP_URL` | `http://localhost:3000` | dominio público estable de staging | dominio público estable de prod |
| `ANTHROPIC_API_KEY` | key "dev" ⚠️ | key "staging" | key "prod" |
| `ANTHROPIC_MODEL` | (opcional) | (opcional) | (opcional) |

La columna **prod** de la tabla es de referencia (se rellenará cuando exista prod, §0);
hoy solo se configuran las columnas **dev** y **staging**.

⚠️ **Keys de Anthropic separadas con límite de gasto** en la de dev/staging (Console →
Billing → Spend limits): un bucle infinito en desarrollo no puede costarte el
presupuesto del mes. Esto es control de blast radius aplicado al COGS.

**Dos almacenes de secretos, dos consumidores** (fuente de confusión clásica):
- **Vercel env vars** → los lee la APP desplegada (functions + build del frontend).
- **GitHub Environment secrets** → los lee el CI. Cada environment (`staging` o
  `production`) expone un secret llamado `DATABASE_URL`.

Son valores independientes. Que `prisma migrate deploy` funcione en GitHub no demuestra
que el `DATABASE_URL` configurado en Vercel sea correcto.

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

**Nota de diseño**: `migrate.yml` comprueba el secret `DATABASE_URL` del GitHub
Environment correspondiente. Si falta, el job avisa y termina en verde.

---

## 6. Runbook — tareas de Jaime 🧑‍💻 (en orden, ~45 min)

**Supabase** (con la organización/cuenta actual):
- [x] 1. Renombrar mentalmente el proyecto actual como **dev** (opcional: renombrarlo "pliegos-dev" en Settings → General).
- [x] 2. Crear proyecto **staging** — región **Ireland (eu-west-1)**. Anotar: Project URL, anon key, JWT Secret, y el connection string del **Session pooler** (¡el pooler, no el Direct! — recuerda el gotcha IPv6 de CLAUDE.md §5).
- [~] 3. ~~Crear proyecto **prod**~~ → **APLAZADO** (límite de 2 proyectos del plan free, ver §0). Se crea con el primer piloto de pago, subiendo a Supabase Pro.
- [x] 4. En staging: configurar Auth invite-only, Redirect URLs y SMTP para los magic
  links. El self-service crea organizaciones, no cuentas sin invitación.

**Anthropic Console**:
- [x] 5. Crear 3 API keys: `pliegos-dev`, `pliegos-staging`, `pliegos-prod`. Límite de gasto bajo en dev/staging (p.ej. 25€/mes).
- [x] 6. Sustituir la key de `.env.local` por `pliegos-dev` (la actual además estaba caducada).

**Vercel** (Settings → Environment Variables):
- [~] 7. ~~**Production** con valores de PROD~~ → APLAZADO con prod (§0). Mientras
  tanto, Production puede apuntar a STAGING si se necesita una URL pública.
- [x] 8. **Preview** con scope a la rama `develop`: variables de BD, Auth, `APP_URL` y
  Anthropic con valores de STAGING.
- [x] 9. **Development**: valores de dev (o se omite: `.env.local` + `vercel env pull` ya lo cubren).

**GitHub** (repo → Settings):
- [x] 10. Environments → crear `staging` (sin protección) y `production` (**Required reviewers: tú**) — el de production queda creado pero dormido hasta que exista prod.
- [x] 11. En el environment `staging`: secret `DATABASE_URL` = **Session pooler de staging** . El de `production` se rellena cuando exista prod.
- [x] 12. Comprobar que la rama `develop` existe y está al día con `main`.

**Primer viaje del pipeline (la verificación del bloque)**:
- [x] 13. Push a `develop` verificado: `migrate.yml` aplica el schema a staging.
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

## 9. Comprobación y errores habituales

Comprobar el schema del entorno al que apunta `DATABASE_URL`:

```bash
npm run db:migrate:deploy
npx prisma migrate status
```

`migrate deploy` aplica estructura y funciones; no copia datos entre entornos.

En Vercel, un error Prisma `P1000 Authentication failed` significa que la Function está
recibiendo credenciales de Postgres incorrectas. Revisar el `DATABASE_URL` del scope
exacto del deployment — normalmente Preview para `develop`— y redesplegar después de
cambiarlo.

El formato del Session pooler es:

```text
postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres
```

No confundir la contraseña de Postgres con la service role key, la anon key o la
contraseña de la cuenta de Supabase.
