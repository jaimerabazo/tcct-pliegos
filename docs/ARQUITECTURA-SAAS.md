# Documento de Arquitectura — Plataforma B2B SaaS de análisis de licitaciones

> **Bloque 0** del plan demo → producto comercial. Este documento se escribe ANTES de
> tocar código: es el que un equipo profesional redactaría en el kickoff. Cada decisión
> lleva su porqué — el objetivo es tanto decidir como aprender a decidir.
>
> Estado: **v1 en implementación** (actualizado el 24/07/2026). Los Bloques 0–2 están
> cerrados y las fases 1–4 del Bloque 3 están en `develop`. El detalle del código
> desplegado está en `BLOQUE-3-IMPLEMENTACION-TENANCY.md`.
>
> Nombre del producto: pendiente ("TCCT Pliegos" muere; la marca no puede referenciar al
> empleador actual).

---

## 1. Visión y cliente

**Producto**: análisis automático de expedientes de licitación pública española (PPT/PCAP)
con LLM — extracción estructurada, validación humana con índice de confianza, y outputs
de decisión (presentación para comité, próximamente comparativas/borradores).

**Cliente objetivo**: consultoras e integradores que licitan, ~10 personas por empresa.
Perfil sin equipo técnico propio, sensibilidad al precio media, y un dolor claro: el
triaje/análisis de pliegos consume horas de perfiles caros (el "bid manager" es a menudo
el propio socio).

**Implicaciones directas del perfil de cliente** (lección: el cliente define la arquitectura):
- Muchos tenants pequeños → multi-tenancy de BD compartida (el coste marginal por tenant debe ser ~0).
- Sin IT propio → onboarding 100% self-service, cero configuración, magic link (sin gestionar contraseñas).
- Empresas pequeñas → no pedirán SSO/SAML ni aislamiento físico al principio (eso llega si algún día vendes a grandes; se cobra como enterprise).
- Documentos confidenciales de SU negocio → la confianza es el producto. Un solo incidente de fuga cross-tenant mata la empresa.

**Restricción fundacional**: founder en solitario. Regla que gobierna todo lo demás:
**cada pieza debe poder operarla, entenderla y repararla una sola persona**. Tecnología
aburrida, servicios gestionados, y comprar todo lo que no sea el core.

---

## 2. Principios de diseño

1. **El core es la extracción** (pipeline LLM + Structured Outputs + validación + confianza). Todo lo demás se compra: auth (Supabase), pagos (Stripe), email (Resend), hosting (Vercel), errores (Sentry).
2. **Seguridad por diseño, en capas**: ninguna protección depende de una única línea de código.
3. **Boring tech**: el stack actual (React/Vite + Vercel Functions + Supabase/Postgres + Prisma) SE MANTIENE. Es un stack de referencia para SaaS de founder en solitario. Cambiarlo sería coste sin beneficio.
4. **Simplicidad como feature**: cada rol, plan, opción o toggle que se añade es mantenimiento perpetuo. v1 minimalista.

---

## 3. Decisión de tenancy

**Decisión: base de datos compartida + columna `organization_id` en toda tabla de datos de cliente + Row-Level Security como segunda capa.**

| Opción | Pros | Contras | Veredicto |
|---|---|---|---|
| BD compartida + tenant_id | Coste marginal ~0/tenant, una migración, un backup, estándar del sector para arrancar | Exige disciplina total en el scoping | ✅ **Elegida** |
| Schema por tenant | Aislamiento lógico fuerte | Migraciones ×N, tooling complejo | ❌ Overkill para tenants de 10 personas |
| BD por tenant | Aislamiento físico | Ops ×N — inviable en solitario | ❌ Solo como oferta enterprise futura |

**Regla de oro (no negociable): ninguna tabla con datos de cliente existe sin `organization_id`, y ninguna query los lee sin filtrar por él.**

---

## 4. Modelo de datos objetivo (v1)

```
organizations
  id, name, slug, plan, created_at

memberships                        ← relación usuario↔org CON rol
  user_id (→ auth.users de Supabase), organization_id, role (owner|member), created_at
  PK compuesta (user_id, organization_id)

invitations
  id, organization_id, email, role, token_hash, expires_at, accepted_at

pliegos                            ← la tabla actual, ahora scoped
  id, organization_id, created_by, updated_by, ...campos actuales..., analysis_data

usage_events                       ← metering (base del billing y del control de COGS)
  id, organization_id, user_id, type (analyze|presentation), tokens_in, tokens_out,
  cost_estimate, created_at

audit_log
  id, organization_id, user_id, action, entity_type, entity_id, detail (json), created_at
```

**Por qué `memberships` como tabla y no "org_id en el usuario"** (lección de modelado):
una columna en User = un usuario pertenece a UNA org para siempre. Una tabla intermedia =
el modelo soporta multi-org (un consultor freelance en dos empresas, tú mismo entrando
como soporte) sin costar nada extra hoy. Modelar la relación N:M cuesta lo mismo que la
1:N y no te cierra puertas.

**Por qué `usage_events` desde el día uno**: cada análisis tiene coste real (tokens de
Claude = tu COGS). Sin medición no hay límites de plan, ni pricing informado, ni defensa
contra un cliente que te quema el margen. Se escribe UNA fila por operación LLM — barato
ahora, imposible de reconstruir después.

---

## 5. AuthN / AuthZ

- **AuthN** (¿quién eres?): Supabase Auth con magic link — **ya construido, sobrevive tal cual** (guard JWT + AuthGate + login).
- **AuthZ** (¿qué puedes hacer?): rol por membership. v1 con SOLO dos roles:

| Acción | owner | member |
|---|---|---|
| Analizar / editar / generar pptx | ✅ | ✅ |
| Invitar y quitar usuarios | ✅ | ❌ |
| Billing y plan | ✅ | ❌ |
| Borrar la organización | ✅ | ❌ |

- **Org activa en cada request**: el frontend manda `X-Organization-Id`; el backend verifica que el `user.id` del JWT tiene membership en esa org (y con qué rol) ANTES de tocar datos. Middleware único `requireMember(req, res, { role })` — evolución natural del `requireUser` ya construido.

---

## 6. Aislamiento: defensa en profundidad (el corazón del documento)

Estado actual: las capas 1 y 2 están implementadas. La capa 4 cubre ya el aislamiento de
los handlers con dobles en memoria. Para cerrar el Bloque 3 faltan la capa 3 y la parte
de la capa 4 que prueba RLS contra PostgreSQL real. Ver
`BLOQUE-3-IMPLEMENTACION-TENANCY.md §19`.

**Capa 1 — Authz en el endpoint**: `requireMember` valida usuario + membership + rol.

**Capa 2 — Scoping en toda query**: nunca `findUnique({ id })` a secas; siempre
`{ id, organizationId }`. Patrón: un helper/repositorio que OBLIGA a pasar la org
(que la forma fácil de escribir código sea la segura).

**Capa 3 — RLS en Postgres**: políticas que impiden leer/escribir filas de otra org
aunque el código tenga un bug. Nota técnica importante (lo aprendimos en este proyecto):
Prisma conecta con service role y **se salta el RLS**. Solución estándar: fijar la org
del request en una variable de sesión de Postgres (`set_config('app.org_id', ...)` en la
transacción) y que las políticas RLS lean `current_setting('app.org_id')`. Se implementa
una vez en el cliente Prisma y protege todo.

**Capa 4 — Tests de aislamiento en CI**: una suite que crea la Org A y la Org B e intenta
sistemáticamente leer/editar datos de B autenticado en A. **Es el test más importante del
producto** y corre como gate en cada PR, como hoy corre la cobertura.

---

## 7. Threat model (v1, "de andar por casa" pero honesto)

| Activo | Amenaza | Mitigación |
|---|---|---|
| Pliegos y análisis de clientes | Fuga cross-tenant (bug o ataque) | Capas 1-4 de §6 |
| Cuenta de usuario | Robo de sesión / magic link interceptado | Expiración corta del link, rate limit de OTP (Supabase lo trae), sesiones revocables |
| API LLM | Abuso de coste (cliente entusiasta o atacante) | Metering + límites por plan + rate limit por org en endpoints LLM |
| Secretos (API keys, DB) | Filtración | Secrets por entorno en Vercel, jamás en repo, rotación semestral |
| Base de datos | Pérdida / corrupción | Backups automáticos de Supabase + **simulacro de restore trimestral** (un backup no probado no existe) |
| Datos personales | Incumplimiento RGPD | Residencia UE, DPAs, retención definida, borrado completo por org (offboarding) |
| Disponibilidad | Caída de Vercel/Supabase/Anthropic | Asumida y comunicada (SLA honesto); status page; sin HA multi-proveedor en v1 |

---

## 8. Entornos e infraestructura

```
dev        local (vercel dev) + proyecto Supabase "dev"      → datos falsos, seeds
staging    Vercel preview + proyecto Supabase "staging"      → réplica de prod, pruebas de migración
production Vercel prod + proyecto Supabase "prod" REGIÓN UE  → datos reales, intocable a mano
```

- **Regiones UE obligatorias** (RGPD + argumento de venta): Supabase eu-central/eu-west, Vercel functions en `fra1`/`cdg1`. ⚠️ TODO: verificar la región del proyecto Supabase actual; si no es UE, el de prod se crea nuevo.
- Migraciones: `prisma migrate deploy` ejecutado por CI contra staging al merge, y contra prod en la promoción. Nunca `migrate dev` contra prod.
- El proyecto Supabase actual pasa a ser **dev**. Staging y prod se crean limpios.

---

## 9. Flujo de datos LLM (transparencia = confianza = ventas)

- PDF del cliente → Vercel Function → API de Anthropic → JSON estructurado → Postgres.
- ⚠️ TODO: revisar los términos de retención de datos de la API de Anthropic (y opciones zero-data-retention) para poder declararlo en el DPA. Por defecto la API no entrena con datos de clientes — documentarlo con fuente.
- Subprocesadores a declarar: Supabase, Vercel, Anthropic, Stripe, Resend.
- PDFs >4.5MB (límite de Vercel): subida directa navegador → Supabase Storage (bucket con políticas RLS por org) y la function lee de ahí. Resuelve el límite Y mantiene los documentos en la UE.

---

## 10. Monetización (esbozo — se valida con pilotos, no se adivina)

- Suscripción mensual por organización: N análisis/mes + M usuarios según plan.
- Stripe Checkout + Customer Portal (no construir UI de billing propia).
- `usage_events` alimenta el contador; al 80% del límite se avisa, al 100% se bloquea el análisis (nunca a mitad de uno).
- Trial de 14 días sin tarjeta → fricción mínima para el perfil de cliente.

## 11. Alcance del MVP comercial (v1)

**Dentro**: registro self-service de org → invitar equipo → subir/analizar pliego → validar/editar (con confianza) → generar presentación → límites de plan → billing → audit log básico.

**Fuera (explícitamente)**: comparativa entre pliegos, generador RFP, RAG, SSO/SAML, API pública, export Excel, white-label. Cada "fuera" es una decisión, no un olvido.

## 12. Qué sobrevive del código actual

| Pieza | Destino |
|---|---|
| Pipeline extracción (analyze.js + schemas Zod + Structured Outputs) | ✅ Core intacto, se le añade scoping + metering |
| Generador PPTX (builder/renderer/theme) | ✅ Intacto (rebranding del deck pendiente) |
| Auth magic link + guard JWT + AuthGate | ✅ Base directa; se le añade la dimensión org/rol |
| Tests + CI + patrones de inyección | ✅ La cultura entera sobrevive |
| Schema `Pliego` global | ✅ Scoped por org; pendiente hacer obligatorias las columnas tenant |
| Workspace único compartido | ✅ Sustituido por organizaciones y memberships |
| Marca "TCCT Pliegos" y branding del deck | ❌ Muere |

## 13. Riesgos y TODOs no técnicos (bloqueantes reales)

1. ⚠️ **IP / empleador**: el producto nace de un contexto laboral en TCCT. Revisar contrato (cláusulas de propiedad intelectual y no competencia) y buscar asesoría legal ANTES de facturar el primer euro. Es el mayor riesgo del proyecto y no se resuelve con código.
2. Nombre y marca propios (+ dominio, registro de marca si procede).
3. Términos de servicio, política de privacidad y DPA propios (plantillas legales para SaaS, revisión profesional).
4. Alta de autónomo/SL, facturación — en el momento de los pilotos de pago.

## 14. Roadmap de bloques (aprender construyendo)

- [x] **Bloque 0** — este documento.
- [x] **Bloque 1** — Diseño en detalle del tenancy/RBAC/RLS (`docs/BLOQUE-1-DISENO-TENANCY.md`).
- [x] **Bloque 2** — Entornos + CI de migraciones (`docs/BLOQUE-2-ENTORNOS.md`). Nota: 2 entornos (dev+staging), prod aplazado por el plan free de Supabase (ver ese doc §0).
- [~] **Bloque 3** — Fases 1–4 completadas: orgs, memberships, invitaciones, scoping y
  onboarding (`docs/BLOQUE-3-IMPLEMENTACION-TENANCY.md`). Pendientes la **Fase 5**
  (contract + RLS) y la **Fase 6** (gate de aislamiento contra PostgreSQL real).
- [ ] **Bloque 4** — Billing: Stripe + metering + límites.
- [ ] **Bloque 5** — Hardening: audit log, rate limits, Sentry, backups probados, docs RGPD.
- [ ] **Bloque 6** — Pilotos: 2-3 consultoras conocidas, feedback, pricing real.

---

*Cada decisión de este documento es discutible — eso es lo que lo hace útil. Cuando una
cambie, se actualiza el documento y se anota el porqué (como el CLAUDE.md del repo).*
