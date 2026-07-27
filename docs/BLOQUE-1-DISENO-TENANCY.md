# Bloque 1 — Diseño en detalle: multi-tenancy, RBAC y RLS

> Baja a tierra el §4-§6 de `ARQUITECTURA-SAAS.md`. Sigue siendo papel: nada de esto se
> implementa hasta que el diseño esté revisado (la implementación es el Bloque 3, con los
> entornos del Bloque 2 ya montados). Cada bloque de código va anotado con su porqué.
>
> Estado: **borrador v1** (16/07/2026) · Decisiones pendientes marcadas como ⚖️

---

## 1. Schema Prisma completo (v1)

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// TENANCY
// ─────────────────────────────────────────────────────────────────────────────

model Organization {
  id        String    @id @default(cuid())
  name      String                          // razón social visible ("Acme Consulting SL")
  slug      String    @unique               // identificador url-safe ("acme-consulting")
  plan      String    @default("trial")     // trial|starter|pro — String, no enum: los planes
                                            // cambiarán con el pricing; un enum de Postgres
                                            // exige migración por cada cambio (Bloque 4 lo refina)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?                       // ⚖️ soft-delete con purga diferida (ver §5)

  memberships Membership[]
  invitations Invitation[]
  pliegos     Pliego[]
  usageEvents UsageEvent[]
  auditLog    AuditEntry[]

  @@map("organizations")
}

enum Role {
  owner
  member
}

model Membership {
  userId         String   // uuid de auth.users (Supabase Auth). SIN foreign key: auth.users
                          // vive en el schema `auth` de Supabase y Prisma modela `public`;
                          // un FK cross-schema es posible pero ata el schema de Prisma al
                          // interno de Supabase. Integridad garantizada por el flujo de
                          // invitación (solo se crea membership al aceptar una invitación).
  organizationId String
  role           Role     @default(member)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@id([userId, organizationId])   // PK compuesta: un usuario no puede estar dos veces en
                                   // la misma org, y la unicidad la garantiza la BD, no el código
  @@index([organizationId])        // la query "miembros de esta org" (la PK ya cubre la inversa)
  @@map("memberships")
}

model Invitation {
  id             String    @id @default(cuid())
  organizationId String
  email          String
  role           Role      @default(member)
  tokenHash      String    @unique  // se guarda el HASH (sha-256) del token, NUNCA el token.
                                    // Mismo principio que las contraseñas: si roban la BD,
                                    // no pueden usar las invitaciones pendientes.
  expiresAt      DateTime            // 1 hora, alineada con Email OTP Expiration de Supabase
  acceptedAt     DateTime?           // null = pendiente. No se borra al aceptar: es historial
  createdBy      String              // userId del que invitó (audit)
  createdAt      DateTime  @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, email])  // "¿tiene ya este email una invitación pendiente aquí?"
  @@map("invitations")
}

// ─────────────────────────────────────────────────────────────────────────────
// DOMINIO (la tabla actual, ahora scoped)
// ─────────────────────────────────────────────────────────────────────────────

model Pliego {
  id             String    @id @default(cuid())
  organizationId String                       // LA columna. Toda query la filtra; el RLS la vigila.
  expediente     String
  titulo         String
  organismo      String
  importe        Float?
  lotes          Int
  estado         String
  procedimiento  String
  ens            String
  fechaAnalisis  DateTime  @default(now())
  fechaLimite    DateTime?
  analysisData   Json?
  createdBy      String                       // userId — quién lo subió
  updatedBy      String?                      // userId — última edición humana (audit ligero;
                                              // el detalle fino va en audit_log)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, expediente])  // CAMBIO respecto a hoy: `expediente` era @unique
                                          // GLOBAL — ¡dos clientes analizando el mismo pliego
                                          // público chocarían! La unicidad natural es por org.
  @@index([organizationId, fechaAnalisis(sort: Desc)])  // la query del dashboard, tal cual
  @@map("pliegos")
}

// ─────────────────────────────────────────────────────────────────────────────
// METERING Y AUDITORÍA
// ─────────────────────────────────────────────────────────────────────────────

model UsageEvent {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  type           String   // 'analyze' | 'presentation' — String, no enum: añadir un tipo de
                          // evento no debería requerir migración
  tokensIn       Int
  tokensOut      Int
  costEstimate   Decimal? @db.Decimal(10, 6)  // € al precio de HOY, congelado. Los precios de
                                              // Anthropic cambian; la contabilidad no se recalcula.
  pliegoId       String?                      // SIN FK a propósito: la contabilidad sobrevive
                                              // al borrado del pliego. Un evento es un hecho
                                              // histórico, no una relación viva.
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, createdAt])  // LA query de metering: "eventos de esta org este mes".
                                        // El índice se diseña desde la query, no al revés.
  @@map("usage_events")
}

model AuditEntry {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  action         String   // convención 'entidad.verbo': 'pliego.create', 'pliego.update',
                          // 'member.invite', 'member.remove', 'org.plan_change'...
  entityType     String
  entityId       String
  detail         Json?    // el diff o contexto ({ seccion: 'lotes', antes: X, despues: Y })
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, createdAt])
  @@map("audit_log")
}
```

**Principio transversal — append-only**: `usage_events` y `audit_log` solo se insertan.
La app no expone UPDATE/DELETE sobre ellas y el RLS lo prohíbe (§4). Un registro de
auditoría editable no es un registro de auditoría.

---

## 2. Matriz de permisos v1 (definitiva)

| Acción | owner | member | Nota |
|---|:-:|:-:|---|
| Ver/analizar/editar pliegos | ✅ | ✅ | El trabajo diario |
| Generar presentación | ✅ | ✅ | |
| Borrar pliego | ✅ | ✅ | Queda en audit_log sea quien sea (decisión D2, §5) |
| Invitar usuarios | ✅ | ❌ | |
| Quitar usuarios / cambiar roles | ✅ | ❌ | Un owner no puede quitarse a sí mismo si es el último |
| Ver audit log | ✅ | ❌ | |
| Billing / cambiar plan | ✅ | ❌ | |
| Renombrar org | ✅ | ❌ | |
| Borrar organización | ✅ | ❌ | Con confirmación tecleada + ventana de purga (§5) |

Dos roles y basta. Cada rol nuevo (viewer, admin, billing-only…) se añade **cuando un
cliente de pago lo pida dos veces**, no antes.

---

## 3. Middleware `requireMember` (evolución del `requireUser` actual)

```
requireMember(req, res, { role } = {})
  1. user = requireUser(req, res)                 ← lo ya construido, intacto
     └─ falla → 401 "no sé quién eres"
  2. orgId = req.headers['x-organization-id']
     └─ falta → 400 "petición malformada"
  3. membership = SELECT role FROM memberships
                  WHERE user_id = user.id AND organization_id = orgId
     └─ no existe → 403 "sé quién eres, y no puedes"
  4. role exigido === 'owner' && membership.role !== 'owner' → 403
  5. return { user, orgId, role: membership.role }   ← el "contexto de request"
```

**Lección — la semántica de los códigos**: `401` = fallo de *identidad* (no hay token
válido). `403` = fallo de *permiso* (identidad correcta, acceso no). `404` = el recurso
no existe **o no existe PARA TI**: cuando alguien de la org A pide el pliego X de la org
B, la query scoped (`WHERE id AND organization_id`) no devuelve nada → 404. Eso es
deliberado: un 403 le confirmaría al atacante que el recurso existe. **El scoping correcto
no revela ni la existencia.**

**El frontend**: guarda la org activa (localStorage) y manda `X-Organization-Id` en cada
fetch (evolución natural del `apiFetch` ya construido). El header es *una afirmación del
cliente que el servidor verifica siempre* contra memberships — nunca se confía en él.

---

## 4. Row-Level Security: el diseño exacto

**Mecanismo** — la org del request viaja a Postgres como variable de transacción:

```sql
-- Lo ejecuta el cliente Prisma al inicio de cada transacción de request:
SELECT set_config('app.org_id', '<orgId verificado por requireMember>', true);
--                                                                      ↑
--                                    true = scope de TRANSACCIÓN, no de conexión.
--                                    Crítico con pooler: la conexión se comparte entre
--                                    requests; una variable de sesión se filtraría de un
--                                    tenant al siguiente. De transacción, muere con ella.
```

**Políticas** (patrón idéntico para `pliegos`, `usage_events`, `audit_log`, `invitations`, `memberships`):

> 🛠️ **CORREGIDO EN LA IMPLEMENTACIÓN (fase 5b, 26/07/2026).** Este diseño era
> **insuficiente**: al verificarlo contra la base real se comprobó que el rol con el que
> la app conecta en Supabase (`postgres`) tiene el atributo **`BYPASSRLS`**, que se salta
> TODAS las políticas — y `FORCE` no lo impide (FORCE solo obliga al *propietario* de la
> tabla; no anula `BYPASSRLS`). Aplicando este apartado tal cual, el RLS habría quedado
> **decorativo**: prueba empírica → como `postgres` sin cambiar de rol se seguían viendo
> las filas de todos los tenants.
>
> **Lo implementado**: un rol `app_tenant` sin `BYPASSRLS` y que no es propietario de las
> tablas; el cliente de runtime hace `SET LOCAL ROLE app_tenant` + `set_config` dentro de
> la transacción de cada request (`api/_lib/tenantDb.js`). **No se usa FORCE**: el
> propietario debe seguir operando sin trabas en migraciones y backfills, y la protección
> de runtime la da el cambio de rol. Ver `prisma/migrations/20260726120000_rls_tenant_isolation`.
>
> Otros dos detalles que solo aparecen al ejecutarlo: `GRANT ... TO CURRENT_USER` **aborta
> la conexión** en Supabase (hay que usar `format('GRANT ... TO %I', current_user)`), y
> `ALTER ROLE ... NOSUPERUSER` lo rechaza la extensión `supautils`.

```sql
ALTER TABLE pliegos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pliegos FORCE ROW LEVEL SECURITY;
-- ⚠️ FORCE es imprescindible y casi nadie lo sabe: el DUEÑO de la tabla se salta el RLS
-- por defecto, y Prisma conecta como el rol que creó las tablas. Sin FORCE, todo este
-- apartado sería decorativo.  ← ver la corrección de arriba: NO basta con FORCE.

CREATE POLICY org_isolation ON pliegos
  USING      (organization_id = current_setting('app.org_id', true))   -- filtra LECTURAS
  WITH CHECK (organization_id = current_setting('app.org_id', true));  -- valida ESCRITURAS
-- USING: qué filas puedes ver/tocar. WITH CHECK: qué filas puedes crear/dejar tras un
-- UPDATE. Sin WITH CHECK podrías INSERTAR un pliego en la org de otro.

-- Append-only para auditoría y metering (además del org_isolation):
CREATE POLICY no_update ON audit_log FOR UPDATE USING (false);
CREATE POLICY no_delete ON audit_log FOR DELETE USING (false);
```

**En Prisma** — una extensión del cliente envuelve cada operación en una transacción que
fija la variable primero (se implementa UNA vez en `api/_lib/prisma.js`, protege todo):

```js
// esbozo conceptual (Bloque 3):
const orgScopedPrisma = (orgId) => prisma.$extends({
  query: {
    async $allOperations({ args, query }) {
      const [, result] = await prisma.$transaction([
        prisma.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`,
        query(args),
      ]);
      return result;
    },
  },
});
```

**Excepciones al RLS** (documentadas, no accidentales): las migraciones (rol admin,
fuera del runtime) y el flujo de aceptar invitación (necesita leer la invitación ANTES
de tener membership — se hace con una función SQL `SECURITY DEFINER` o un guard propio,
se decide en Bloque 3).

---

## 5. ✅ Decisiones cerradas (16/07/2026, Jaime)

**D1 — Borrado de pliegos: DIRECTO en v1.** La papelera obliga a que todas las queries
filtren `deletedAt IS NULL` para siempre (impuesto perpetuo a cambio de un caso raro), y
un pliego borrado por error se recupera re-subiendo el PDF. Se reconsidera si los pilotos
la piden.

**D2 — Un `member` SÍ puede borrar pliegos.** Equipos de ~10 personas de confianza;
restringirlo genera fricción sin ganancia real, y el audit_log deja quién lo hizo.
(La matriz del §2 queda: "Borrar pliego" → owner ✅ / member ✅.)

**D3 — Borrado de organización: soft-delete con PURGA A 30 DÍAS** (`deletedAt` + job de
purga). Protege del "owner cabreado borra todo un viernes"; compatible RGPD (la ventana
se comunica en la política de privacidad; supresión inmediata a petición ejecutando la
purga a mano). Nota de implementación: el `deletedAt` de `Organization` NO contamina las
queries del día a día — el middleware rechaza toda request a una org con `deletedAt`
(403 "organización desactivada"), un único punto de control en vez de un filtro por query.

---

## 6. Plan de tests de aislamiento (adelanto del gate del Bloque 3)

La suite que convierte el §6 de la arquitectura en un CONTRATO verificado en cada PR:

```
Fixture: Org A (owner Ana, member Marc) · Org B (owner Berta) · pliegos en ambas

- Berta lista pliegos → SOLO los de B (nunca los de A)
- Berta pide GET /pliegos/{id-de-A} → 404 (no 403: no revelar existencia)
- Berta PATCH /pliegos/{id-de-A} → 404, y el pliego de A queda intacto
- Marc (member) invita a alguien → 403 · Ana (owner) invita → 200
- Request sin X-Organization-Id → 400 · con org donde no hay membership → 403
- INSERT directo saltándose el scoping (simulando bug de app) → el RLS lo rechaza
- audit_log: UPDATE/DELETE → rechazados por RLS (append-only real)
```

---

## 7. Qué NO cambia

El pipeline de extracción, el generador PPTX, el patrón de inyección en tests, el guard
`requireUser` (pasa a ser el paso 1 de `requireMember`) y el flujo de magic link. El
Bloque 3 es una *extensión* de lo construido, no una reescritura.

---

*Siguiente: Bloque 2 (entornos dev/staging/prod + CI con migraciones) — se monta ANTES de
implementar esto, para que el Bloque 3 nazca ya con staging donde ensayar las migraciones.*
