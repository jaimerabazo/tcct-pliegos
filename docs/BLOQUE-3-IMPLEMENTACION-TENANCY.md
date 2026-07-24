# Bloque 3 — Implementación del multi-tenancy y onboarding

Este documento describe el código que está en `develop` desde la PR #23. El diseño
previo está en [BLOQUE-1-DISENO-TENANCY.md](./BLOQUE-1-DISENO-TENANCY.md); aquí se
documenta lo que existe de verdad, sus invariantes y lo que todavía queda pendiente.

## 1. Estrategia de entrega

La idea rectora del bloque es que **el propio Bloque 3 sea el primer cliente del pipeline
de migraciones construido en el Bloque 2**.

El tenancy no se entrega mediante una migración grande al final. Se divide en seis fases
pensadas como PRs pequeños hacia `develop`. Cada merge debe:

1. pasar tests, cobertura y build;
2. ejecutar `prisma migrate deploy` contra staging mediante `migrate.yml`;
3. demostrar que el código viejo y el schema nuevo pueden convivir;
4. dejar una unidad revisable y, si es necesario, reversible mediante otra migración.

La transición de `Pliego` sigue expand & contract aunque staging no tenga clientes. El
objetivo es ensayar ahora la disciplina que será obligatoria cuando existan datos reales:

```text
EXPAND    añadir columnas nullable y tablas nuevas
MIGRATE   escribir scoped y adoptar los datos legacy
CONTRACT  hacer obligatorias las columnas y activar RLS
GATE      demostrar el aislamiento contra PostgreSQL real
```

### Estado

| Fase | Estado | Resultado |
|---|---|---|
| 1. Expand del schema | Completada | tablas tenant y columnas nullable |
| 2. `requireMember` | Completada | autorización por organización y rol |
| 3. Scoping + frontend org-aware | Completada | API y caché separadas por tenant |
| 4. Organizaciones + onboarding | Completada | alta, invitaciones y gestión de equipo |
| 5. Contract + RLS | Pendiente | cierre del schema y defensa en base de datos |
| 6. Gate cross-tenant | Pendiente | tests contra PostgreSQL real y RLS |

Hay dos adelantos respecto al orden original:

- el backfill de pliegos legacy se ejecutó al introducir el código scoped;
- la unicidad `(organizationId, expediente)` ya sustituyó a la unicidad global.

Ambos eran necesarios para que la Fase 3 pudiera escribir de forma segura. La Fase 5
continúa siendo necesaria para hacer `organizationId` obligatorio y activar RLS.

## 2. Fase 1 — Expand del schema

Objetivo: introducir el modelo tenant sin obligar al código existente a conocerlo.

La migración `20260721102717_bloque3_expand_tenancy` añade:

- `organizations`;
- `memberships`;
- `invitations`;
- `usage_events`;
- `audit_log`;
- enum `Role` con `owner` y `member`;
- `organizationId`, `createdBy` y `updatedBy` en `Pliego`.

Las columnas nuevas de `Pliego` nacen nullable. Esto permite desplegar el schema mientras
el código anterior continúa creando y leyendo filas sin contexto tenant.

También se actualiza `prisma/seed.js`:

- crea o actualiza una organización demo;
- cuelga los seis pliegos de esa organización;
- usa `(organizationId, expediente)` como clave idempotente;
- opcionalmente crea la membership owner indicada por `SEED_OWNER_USER_ID`.

Para que la organización demo sea accesible desde la aplicación, `SEED_OWNER_USER_ID`
debe contener un UUID real de Supabase Auth.

Esta fase es deliberadamente aditiva: crea tablas, columnas, relaciones e índices, pero
no elimina ni hace obligatoria ninguna columna existente.

## 3. Fase 2 — `requireMember`

Objetivo: convertir el diseño de autorización en un único guard reutilizable antes de
modificar los endpoints de negocio.

`api/_lib/authz.js` implementa:

1. `requireUser` verifica la identidad;
2. lee `X-Organization-Id`;
3. busca la membership `(userId, organizationId)`;
4. rechaza organizaciones con `deletedAt`;
5. exige `owner` cuando el endpoint lo solicita;
6. devuelve `{ user, orgId, role }`.

La fase fija la semántica de errores:

| Estado | Caso |
|---|---|
| `400` | falta `X-Organization-Id` |
| `401` | JWT ausente o inválido |
| `403` | sin membership, organización desactivada o rol insuficiente |
| `404` | el recurso no existe dentro del tenant |

El `404` cross-tenant no lo produce el guard. Lo produce la query scoped de la Fase 3,
evitando confirmar que un recurso de otra organización existe.

Los tests amplían `api/_lib/testFakePrisma.js` con organizaciones y memberships, y usan
JWTs reales firmados por los helpers de `api/_lib/testAuth.js`.

## 4. Fase 3 — Scoping y frontend org-aware

Objetivo: hacer que todo el producto existente opere dentro de una organización.

### Backend

Los handlers de pliegos, análisis y presentaciones pasan de `requireUser` a
`requireMember`. Toda operación incluye `organizationId`:

- listados: `where: { organizationId }`;
- lecturas: `where: { id, organizationId }`;
- actualizaciones: relectura scoped antes de escribir;
- extracción: upsert por `(organizationId, expediente)`;
- autoría: `createdBy` y `updatedBy`;
- metering: `usage_events` recibe organización y usuario.

`GET /api/orgs` conserva `requireUser` porque es el bootstrap que descubre a qué
organizaciones pertenece el usuario.

### Adopción de datos anteriores

`20260722123000_backfill_legacy_pliegos` asigna organización a las filas antiguas:

- con una organización, las adopta allí;
- sin organizaciones, crea `legacy-pre-tenancy`;
- con varias organizaciones, aborta porque no puede inferir el propietario;
- comprueba al final que no queda ningún `organizationId` nulo.

`20260722124500_scope_pliego_expediente_unique` elimina la unicidad global de expediente
y crea la unicidad por organización. Este paso estaba previsto inicialmente para la
Fase 5, pero se adelantó porque el upsert scoped de esta fase necesita esa clave.

### Frontend

`src/api/http.js` añade `X-Organization-Id` a las requests y mantiene la organización
activa en `localStorage`, con fallback en memoria.

Las claves de TanStack Query incluyen usuario y organización:

```js
['orgs', userId]
['pliegos', userId, organizationId]
['members', userId, organizationId]
['invitations', userId, organizationId]
```

`OrgGate` se coloca entre `AuthGate` y `App`. Resuelve la organización antes de montar
las queries de pliegos, evitando requests sin contexto.

## 5. Fase 4 — Organizaciones y onboarding

Objetivo: permitir que el usuario cree y gestione su tenant sin intervención manual.

Incluye:

- `POST /api/orgs`: crea organización y membership owner en una transacción;
- creación, reenvío, listado y revocación de invitaciones;
- `POST /api/invitations/accept`;
- listado y expulsión de miembros;
- bloqueo del último owner;
- onboarding para usuarios sin organización;
- pantalla Equipo exclusiva para owners.

La aceptación de invitaciones es la excepción deliberada al guard tenant: el usuario
necesita leer la invitación antes de tener membership. Se resuelve con la función
PostgreSQL `accept_organization_invitation`, `SECURITY DEFINER`, que valida y crea la
membership atómicamente.

### Cambio respecto al plan inicial

El diseño inicial daba siete días de validez a la invitación interna. Durante la
implementación se comprobó que el enlace de Supabase Auth caduca antes. Mantener siete
días producía invitaciones que la base mostraba como válidas aunque el correo ya no
pudiera autenticarse.

La implementación final usa **una hora**, alineada con `Email OTP Expiration` de
Supabase. La migración `20260723140000_align_invitation_expiration` acorta también las
invitaciones pendientes existentes. Si se cambia el TTL de Auth, ambos valores deben
modificarse juntos.

El detalle completo del flujo vive en §13.

## 6. Fase 5 — Contract + RLS

Estado: pendiente.

Objetivo: cerrar la transición expand & contract una vez que todo el código escribe y
lee con organización.

La fase debe incluir:

1. verificar que no existan pliegos sin organización;
2. verificar o completar `createdBy`;
3. hacer `Pliego.organizationId NOT NULL`;
4. hacer `createdBy NOT NULL` si todos los flujos permiten el backfill seguro;
5. activar y forzar RLS en las tablas tenant;
6. crear políticas `USING` y `WITH CHECK`;
7. impedir `UPDATE` y `DELETE` en `audit_log` y `usage_events`;
8. fijar `app.org_id` con scope de transacción desde Prisma.

La unicidad por organización ya está aplicada desde la Fase 3, por lo que no debe volver
a crearse en esta migración.

El contexto de RLS debe vivir solo durante la transacción:

```sql
SELECT set_config('app.org_id', '<organizationId>', true);
```

El tercer parámetro `true` es obligatorio. Una variable de sesión podría sobrevivir en
una conexión reutilizada por el pooler y filtrar el contexto de un tenant al siguiente.

Las políticas deben usar ambos lados de la protección:

```sql
USING ("organizationId" = current_setting('app.org_id', true))
WITH CHECK ("organizationId" = current_setting('app.org_id', true))
```

`ENABLE ROW LEVEL SECURITY` no basta: el rol propietario puede saltarse las políticas.
El diseño exige también `FORCE ROW LEVEL SECURITY`.

La aceptación de invitaciones seguirá siendo una excepción controlada mediante su
función `SECURITY DEFINER`.

## 7. Fase 6 — Gate de aislamiento cross-tenant

Estado: pendiente como suite de integración contra PostgreSQL real.

Objetivo: convertir el aislamiento en un contrato obligatorio de CI, no en una
convención que dependa de revisar cada query a mano.

Fixture:

```text
Org A: owner Ana, member Marc, pliegos A1/A2
Org B: owner Berta, pliego B1
```

Escenarios mínimos:

1. Berta lista pliegos y solo recibe B1.
2. Berta solicita A1 y recibe `404`.
3. Berta intenta actualizar A1, recibe `404` y A1 queda intacto.
4. Marc no puede invitar (`403`); Ana sí.
5. Una request sin header recibe `400`; con una org ajena recibe `403`.
6. Un insert directo que simula un bug de scoping es rechazado por RLS.
7. `UPDATE` y `DELETE` sobre `audit_log` y `usage_events` son rechazados.

Los cinco primeros comportamientos ya tienen cobertura a nivel de handler con el doble
Prisma. La fase no estará cerrada hasta que la suite pruebe además los escenarios 6 y 7,
las políticas reales y el comportamiento del pooler.

## 8. Referencia del modelo de datos

La fuente de verdad es `prisma/schema.prisma`.

### Organization

Representa un tenant. Tiene nombre, slug único, plan y `deletedAt` para el futuro
soft-delete. Todas sus relaciones usan borrado en cascada.

### Membership

Relaciona un UUID de Supabase Auth con una organización:

```text
(userId, organizationId) -> role
```

La clave primaria compuesta impide memberships duplicadas. Los roles disponibles son
`owner` y `member`.

### Invitation

Contiene:

- organización y email normalizado;
- rol que se concederá;
- hash SHA-256 del token;
- caducidad;
- fecha de aceptación;
- usuario que creó la invitación.

El token en claro nunca se persiste. La caducidad interna es de una hora y debe seguir
alineada con `Authentication > Email OTP Expiration` de Supabase.

### Pliego

`organizationId` forma parte de la identidad natural del expediente:

```text
UNIQUE (organizationId, expediente)
```

Dos organizaciones pueden analizar el mismo expediente público sin colisionar. La
columna continúa nullable únicamente por la estrategia expand/contract; el backfill ya
garantiza que las filas existentes tengan organización.

### UsageEvent y AuditEntry

`UsageEvent` ya registra tokens y coste estimado para operaciones `analyze` y
`presentation`. El registro es best-effort: un fallo de metering no invalida la
operación del usuario.

`AuditEntry` está modelado, pero todavía no se escribe desde los endpoints.

## 9. Contexto de organización en cada request

El frontend envía:

```http
Authorization: Bearer <supabase-access-token>
X-Organization-Id: <organization-id>
```

`src/api/http.js` añade ambas cabeceras. La organización activa se guarda en
`localStorage`, con fallback en memoria para navegadores que bloquean el almacenamiento.

La caché de TanStack Query incluye siempre usuario y organización:

```js
['pliegos', userId, organizationId]
['members', userId, organizationId]
['invitations', userId, organizationId]
```

Esto evita reutilizar datos de otro tenant o de una sesión anterior.

### `requireMember`

`api/_lib/authz.js` aplica el guard común:

1. `requireUser` verifica el JWT de Supabase.
2. Exige `X-Organization-Id`.
3. Comprueba la membership en base de datos.
4. Rechaza organizaciones desactivadas.
5. Comprueba el rol cuando el endpoint exige `owner`.

Semántica de respuestas:

| Estado | Significado |
|---|---|
| `400` | falta el contexto de organización |
| `401` | no hay una identidad válida |
| `403` | el usuario no pertenece a la organización o no tiene el rol necesario |
| `404` | el recurso no existe dentro de esa organización |

El header no concede acceso: solo declara qué organización quiere usar el cliente. El
backend lo contrasta siempre con `memberships`.

## 10. Scoping de pliegos y operaciones LLM

Todos los accesos a datos de cliente incluyen `organizationId`.

- `GET /api/pliegos` filtra la lista.
- `GET/PATCH /api/pliegos/:id` usa `id + organizationId`.
- `PATCH /api/pliegos/:id/analysis` relee y actualiza dentro del tenant.
- `POST /api/pliegos/:id/presentation` relee el pliego dentro del tenant antes de
  generar el archivo.
- `POST /api/analyze` persiste mediante la clave
  `(organizationId, expediente)`.

Pedir el ID de un pliego de otra organización devuelve `404`, no `403`, para no revelar
que el recurso existe.

## 11. API de organizaciones y equipo

| Método y ruta | Acceso | Función |
|---|---|---|
| `GET /api/orgs` | usuario autenticado | lista sus organizaciones y roles |
| `POST /api/orgs` | usuario autenticado | crea una organización; el creador es owner |
| `GET /api/orgs/:id/invitations` | owner | lista invitaciones pendientes y vigentes |
| `POST /api/orgs/:id/invitations` | owner | crea o reenvía una invitación |
| `DELETE /api/orgs/:id/invitations/:invitationId` | owner | revoca una invitación pendiente |
| `POST /api/invitations/accept` | usuario autenticado | acepta una invitación |
| `GET /api/orgs/:id/members` | owner | lista miembros y resuelve sus emails |
| `DELETE /api/orgs/:id/members/:userId` | owner | quita un miembro |

`GET /api/orgs` es una excepción deliberada a `requireMember`: se ejecuta antes de que
el frontend conozca la organización activa, por lo que solo usa `requireUser`.

## 12. Onboarding en el frontend

La secuencia de gates es:

```text
AuthGate
  ├─ sin sesión -> Login
  └─ con sesión -> OrgGate
       ├─ invitación en URL -> aceptar
       ├─ sin organizaciones -> crear organización
       └─ con organización -> App
```

`OrgGate` se monta antes de `App`, fija la organización activa y solo entonces permite
que se disparen las queries tenant.

Al crear una organización:

1. se genera un slug normalizado;
2. la organización y la membership owner se crean en una transacción;
3. el frontend guarda la nueva organización como activa;
4. se monta la aplicación.

La navegación `Equipo` solo aparece para owners. Desde `src/views/Team.jsx` se pueden
gestionar invitaciones pendientes y miembros.

## 13. Ciclo de una invitación

### 13.1 Creación

El owner envía `{ email, role }`. El backend:

1. normaliza el email;
2. genera 32 bytes aleatorios y los codifica como base64url;
3. guarda únicamente `sha256(token)`;
4. fija una caducidad de una hora;
5. construye `APP_URL?invitation=<token>`;
6. pide a Supabase Auth que envíe el correo.

Si el usuario no existe, se usa `admin.inviteUserByEmail`. Si ya está confirmado,
Supabase rechaza la invitación administrativa y el backend envía un magic link mediante
`signInWithOtp({ shouldCreateUser: false })`.

### 13.2 Reenvío

Volver a invitar el mismo email mientras existe una invitación pendiente reutiliza la
fila, rota el token y reinicia la caducidad. El enlace anterior queda invalidado.

### 13.3 Fallo al enviar el correo

PostgreSQL y Supabase Auth no comparten transacción. Si Auth falla, el backend aplica una
compensación:

- elimina una invitación recién creada; o
- restaura la versión anterior si era un reenvío.

La restauración comprueba el hash actual para no pisar un reenvío concurrente más
reciente.

### 13.4 Aceptación sin membership

La aceptación es la única operación que necesita leer una invitación antes de que el
usuario pertenezca a la organización. Se resuelve con la función PostgreSQL
`accept_organization_invitation`, marcada `SECURITY DEFINER` y sin permiso para
`PUBLIC`.

La función:

1. busca y bloquea la invitación por hash;
2. comprueba que exista, no esté aceptada y no haya caducado;
3. compara el email de la invitación con el email verificado del JWT;
4. crea o actualiza la membership;
5. nunca degrada a un owner existente;
6. marca la invitación como aceptada;
7. devuelve la organización y el rol.

Todo ocurre en una sola transacción.

`OrgGate` retira el token de la barra de direcciones antes de canjearlo para reducir su
exposición en historial, capturas y referrers.

### 13.5 Revocación

Revocar elimina solo invitaciones pendientes, vigentes y pertenecientes a la
organización activa. El enlace de Auth puede seguir iniciando sesión, pero el token
interno deja de existir y no puede crear una membership.

## 14. Invariantes de concurrencia

Se usan locks de PostgreSQL porque varias Vercel Functions pueden ejecutar el mismo flujo
al mismo tiempo.

- **Slug de organización:** un advisory lock serializa nombres que producen el mismo
  slug.
- **Invitación por organización y email:** otro advisory lock evita dos invitaciones
  pendientes simultáneas y hace segura la rotación.
- **Último owner:** `removeMember` bloquea la fila de la organización antes de contar
  owners. Dos owners no pueden eliminarse simultáneamente dejando el tenant sin
  administrador.
- **Organizaciones legacy:** la última migración promueve de forma determinista una
  membership cuando una organización activa no tiene owner y aborta si no existe ningún
  candidato seguro.

El seed se ejecuta después de las migraciones y puede crear la organización demo. Para
mantener este invariante debe definirse `SEED_OWNER_USER_ID` con un UUID real de
Supabase Auth antes de ejecutar `npm run db:seed`.

Los advisory locks se ejecutan con `$executeRaw`. `pg_advisory_xact_lock` devuelve el
tipo PostgreSQL `void`, que el adapter de Prisma 7 no puede deserializar mediante
`$queryRaw`.

## 15. Migraciones del bloque

| Migración | Propósito |
|---|---|
| `20260721102717_bloque3_expand_tenancy` | añade modelos tenant y columnas nullable a `Pliego` |
| `20260722123000_backfill_legacy_pliegos` | adopta de forma segura los pliegos anteriores |
| `20260722124500_scope_pliego_expediente_unique` | cambia la unicidad global por unicidad por organización |
| `20260723120000_accept_invitation_function` | crea la función atómica de aceptación |
| `20260723130000_apply_invitation_role_on_conflict` | aplica el rol invitado sin degradar owners |
| `20260723140000_align_invitation_expiration` | alinea invitaciones existentes con el TTL de Auth |
| `20260723230000_ensure_active_organization_owner` | repara y verifica el invariante de owner |

El backfill sigue estas reglas:

- si no hay pliegos legacy, no hace nada;
- con una sola organización, adopta los pliegos allí;
- sin organizaciones, crea `legacy-pre-tenancy`;
- con varias organizaciones, aborta porque no puede inferir el tenant correcto;
- nunca permite completar dejando un `organizationId` nulo.

## 16. Configuración necesaria

Además de la configuración general de la aplicación, las invitaciones requieren:

```text
DATABASE_URL
SUPABASE_URL o VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
APP_URL
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Reglas:

- `DATABASE_URL` debe pertenecer al mismo proyecto Supabase que las claves de Auth.
- En Vercel, `develop` usa las variables de Preview.
- `APP_URL` debe ser una URL pública estable del entorno, nunca localhost en staging.
- `APP_URL` debe estar permitida en Supabase Authentication → URL Configuration.
- Los cambios de variables en Vercel necesitan un redeploy.
- El SMTP por defecto de Supabase es solo para pruebas limitadas. Para invitar usuarios
  reales hay que configurar un SMTP propio.

Los secretos de Vercel y los de GitHub Actions son almacenes distintos. Que las
migraciones funcionen desde Actions no demuestra que `DATABASE_URL` sea correcto en
Vercel.

## 17. Diagnóstico rápido

### “No se han podido listar las organizaciones”

Mirar primero los logs de la Function:

- `P1000 Authentication failed`: `DATABASE_URL` de Vercel tiene usuario o contraseña
  incorrectos.
- tabla `memberships` inexistente: faltan migraciones en esa base.
- respuesta `[]`: la base funciona; el usuario todavía no tiene organización y debe ver
  onboarding.

### “El envío de invitaciones no está configurado”

Falta `SUPABASE_SERVICE_ROLE_KEY`, la URL del proyecto o `APP_URL` en el entorno de la
Function.

### El magic link abre localhost

`APP_URL` o el `Site URL` de Supabase siguen apuntando a local, o la URL pública no está
en la allowlist de Redirect URLs. Tras corregirlo hay que redesplegar y reenviar la
invitación: los correos antiguos conservan el redirect anterior.

### Rate limit de dos emails por hora

Es el SMTP de demostración de Supabase. Configurar Custom SMTP eleva el límite inicial;
el valor final se administra en Authentication → Rate Limits.

## 18. Tests

El bloque mantiene el patrón del proyecto:

- handlers con dependencias inyectables;
- doble Prisma compartido en `api/_lib/testFakePrisma.js`;
- JWTs reales firmados en tests;
- sin conectar CI a una base remota.

Cobertura relevante:

- autorización y códigos 400/401/403;
- aislamiento A/B en listados, lecturas y actualizaciones;
- creación de organización y owner;
- hash, caducidad, reenvío y compensación de invitaciones;
- aceptación por email y roles;
- revocación;
- protección del último owner;
- onboarding y Team UI;
- clientes HTTP y claves de caché tenant.

Comandos:

```bash
npm test
npm run test:coverage
npm run build
```

## 19. Definition of done del Bloque 3

Las fases 5 y 6 deben completar la defensa en profundidad y convertirla en un gate de
CI:

1. hacer `Pliego.organizationId` y `createdBy` obligatorios;
2. activar y forzar RLS en las tablas tenant;
3. fijar el contexto de organización con scope de transacción;
4. ejecutar tests de aislamiento contra PostgreSQL real;
5. verificar el comportamiento con el pooler usado por Vercel;
6. actualizar este documento y marcar el Bloque 3 como cerrado.

Hasta entonces, el aislamiento efectivo depende de `requireMember` y del scoping
explícito de todas las queries. Está cubierto por tests, pero aún no tiene la defensa en
profundidad de RLS prevista en el diseño.
