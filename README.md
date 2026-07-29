# Analizador de Pliegos

Aplicación web para analizar pliegos de licitación pública. A partir de un PDF extrae
información estructurada con Claude, permite revisarla y editarla, y genera una
presentación para comité de ofertas.

Cada empresa tiene su propio espacio. El acceso se gestiona mediante invitaciones y los
pliegos de una organización no se mezclan con los de otra.

## Desarrollo local

Necesitas Node.js 22, un proyecto de Supabase y una API key de Anthropic.

```bash
npm install
cp .env.example .env.local
```

Completa `.env.local` con las credenciales de desarrollo y aplica las migraciones:

```bash
npm run db:migrate
```

Para cargar datos de ejemplo, añade primero a `.env.local` el UUID de tu usuario de
Supabase:

```text
SEED_OWNER_USER_ID=<uuid-de-auth.users>
```

Después ejecuta:

```bash
npm run db:seed
```

En cada push/PR a `main` o `develop`, GitHub Actions (`.github/workflows/ci.yml`) corre `npm ci`, `npm run test:coverage` y `npm run build`. No necesita `DATABASE_URL` — los tests usan un doble en memoria de Prisma.

### Suite de aislamiento cross-tenant (Postgres real)

Aparte de la unitaria, hay una suite de integración que verifica contra un Postgres de
verdad que **ninguna organización puede ver ni tocar los datos de otra** (el contrato del
`docs/BLOQUE-1 §6`). Comprueba lo que un doble en memoria no puede: constraints, cascadas
y —desde la fase 5b— las políticas RLS.

```bash
npm run test:integration   # necesita DATABASE_URL apuntando a un Postgres real
```

En CI corre en su propio job con un **contenedor de Postgres efímero**, que además aplica
las migraciones desde cero (`migrate deploy`) — así se valida de paso que la carpeta de
migraciones se aplica limpia sobre una BD vacía.

En local, si no tienes Docker, puedes lanzarla contra tu BD de desarrollo: **los tests
crean sus propios datos con ids prefijados `it-` y solo borran lo que ellos crearon** (no
hacen `TRUNCATE`), así que no tocan tus datos de trabajo.

La aplicación completa, incluyendo las funciones de `/api`, se arranca con:

```bash
npx vercel link   # solo la primera vez
npm run dev:api
```

Quedará disponible normalmente en `http://localhost:3000`.

Para trabajar únicamente en el frontend:

```bash
npm run dev
```

## Comprobaciones

```bash
npm test
npm run test:coverage
npm run build
```

## Documentación

- [Índice de documentación](docs/README.md)
- [Arquitectura SaaS](docs/ARQUITECTURA-SAAS.md)
- [Diseño de tenancy, RBAC y RLS](docs/BLOQUE-1-DISENO-TENANCY.md)
- [Entornos y migraciones](docs/BLOQUE-2-ENTORNOS.md)
- [Implementación del multi-tenancy y onboarding](docs/BLOQUE-3-IMPLEMENTACION-TENANCY.md)
