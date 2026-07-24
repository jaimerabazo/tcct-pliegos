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

El seed te añadirá como owner de la organización demo. Sin ese valor, puede crear los
datos pero ningún usuario podrá abrir ese tenant desde la aplicación.

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
