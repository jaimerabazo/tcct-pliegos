# Graph Report - tcct-pliegos  (2026-07-29)

## Corpus Check
- 113 files · ~69,770 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 594 nodes · 1253 edges · 39 communities (25 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3efe2814`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- isolation.integration.test.js
- App.jsx
- Analysis.jsx
- phase4.test.js
- dependencies
- analyze.js
- PPTX Renderer & Pagination
- presentation.js
- SaaS Tenancy Docs & CI/CD Pipeline
- devDependencies
- Supabase Auth Frontend
- usage.test.js
- Prisma Migration Tests
- Vercel Function Config
- RLS Tenant Isolation Design
- Auth & requireMember Design Notes
- Environments Plan (dev/staging/prod)
- SaaS Monetization & Roadmap
- Tech Stack Reference
- Defense-in-Depth Principle
- LLM Data Flow
- MVP Scope
- Threat Model
- Hard-Delete Design Option
- Member Removal Design Option
- Soft-Delete + Purge Design Option
- Expand & Contract Migration Pattern
- Migration Lifecycle
- Environment Variable Map
- README: OrgGate
- Bloque 3 — Implementación del multi-tenancy y onboarding
- supabaseAdmin.js

## God Nodes (most connected - your core abstractions)
1. `withTenant()` - 24 edges
2. `requireMember()` - 22 edges
3. `Bloque 3 — Implementación del multi-tenancy y onboarding` - 20 edges
4. `apiFetch()` - 19 edges
5. `createFakePliegoPrisma()` - 18 edges
6. `jsonOrThrow()` - 16 edges
7. `Analysis()` - 15 edges
8. `scripts` - 14 edges
9. `authHeaders()` - 13 edges
10. `handler()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `main()` --references--> `@prisma/client`  [EXTRACTED]
  prisma/seed.js → package.json
- `buildPerfilesBlocks()` --calls--> `formatNumber()`  [EXTRACTED]
  api/_lib/presentationBuilder.js → src/logic.js
- `buildCoverSpec()` --calls--> `formatNumber()`  [EXTRACTED]
  api/_lib/presentationBuilder.js → src/logic.js
- `CI job: Aislamiento cross-tenant (Postgres real)` --conceptually_related_to--> `Cross-tenant isolation test plan (Org A / Org B fixture)`  [INFERRED]
  .github/workflows/ci.yml → docs/BLOQUE-1-DISENO-TENANCY.md
- `Provisioned non-superuser role pliegos_runtime` --references--> `app_tenant Postgres role (non-owner, no BYPASSRLS)`  [INFERRED]
  .github/workflows/ci.yml → docs/BLOQUE-1-DISENO-TENANCY.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **RLS tenant-isolation defense-in-depth mechanism** — docs_bloque_1_diseno_tenancy_rls_policy_org_isolation, docs_bloque_1_diseno_tenancy_app_tenant_role, docs_bloque_1_diseno_tenancy_bypassrls_correction, docs_bloque_2_entornos_rls_rollout_note, github_workflows_ci_role_pliegos_runtime [INFERRED 0.90]
- **Living SaaS architecture documentation set (Bloques 0-2 + CLAUDE.md)** — docs_arquitectura_saas_doc, docs_bloque_1_diseno_tenancy_doc, docs_bloque_2_entornos_doc, claude_md_bloque3_tenancy_status [EXTRACTED 1.00]
- **CI/CD pipeline: tests, build, and staged migrations** — github_workflows_ci_job_test, github_workflows_ci_job_integration, github_workflows_migrate_job_staging, github_workflows_migrate_job_production, docs_bloque_2_entornos_cicd_pipeline [EXTRACTED 0.95]

## Communities (39 total, 14 thin omitted)

### Community 0 - "isolation.integration.test.js"
Cohesion: 0.09
Nodes (46): requireMember(), acceptInvitation(), availableSlug(), createInvitation(), createOrganization(), hashInvitationToken(), listMembers(), listPendingInvitations() (+38 more)

### Community 1 - "App.jsx"
Cohesion: 0.10
Nodes (32): apiFetch(), getActiveOrgId(), jsonOrThrow(), setActiveOrgId(), acceptInvitation(), createInvitation(), createOrganization(), listMembers() (+24 more)

### Community 2 - "Analysis.jsx"
Cohesion: 0.08
Nodes (38): FieldLabel(), fieldStyle, NumberField(), SelectField(), TextAreaField(), TextField(), ConfidenceBadge(), EditButton() (+30 more)

### Community 3 - "phase4.test.js"
Cohesion: 0.07
Nodes (45): handler(), authConfigured(), encoder, getRemoteJwks(), getUserFromRequest(), requireUser(), supabaseBaseUrl(), verificationKey() (+37 more)

### Community 4 - "dependencies"
Cohesion: 0.04
Nodes (45): @anthropic-ai/sdk, jose, lucide-react, dependencies, @anthropic-ai/sdk, jose, lucide-react, pg (+37 more)

### Community 5 - "analyze.js"
Cohesion: 0.09
Nodes (33): config, getAnthropicResult(), getClientErrorMessage(), handler(), persistAnalysis(), PLIEGO_ANALYSIS_SCHEMA, readRequestBody(), CTX_A (+25 more)

### Community 6 - "PPTX Renderer & Pagination"
Cohesion: 0.13
Nodes (38): addContentHeader(), addFooter(), bodySpan(), charsPerLine(), estimateBlockHeight(), estimateBulletItemHeight(), estimateBulletItemHeights(), estimateBulletsBlockHeight() (+30 more)

### Community 7 - "presentation.js"
Cohesion: 0.12
Nodes (32): buildCoverSpec(), buildCriteriosBlocks(), buildFinalSpec(), buildLotesBlocks(), buildPenalizacionesBlocks(), buildPerfilesBlocks(), buildPlazosBlocks(), buildResumenBlocks() (+24 more)

### Community 8 - "SaaS Tenancy Docs & CI/CD Pipeline"
Cohesion: 0.07
Nodes (33): Bloque 3 multi-tenancy in progress (feat/tenancy branch series), Pivot to commercial B2B SaaS (from internal TCCT tool), Prisma 7 + Supabase pooler gotchas (IPv6 Direct, driver adapter), Analizador de Pliegos / TCCT Pliegos project, Typography: Space Grotesk + Inter + JetBrains Mono, v1 data model (organizations/memberships/invitations/pliegos/usage_events/audit_log), ARQUITECTURA-SAAS.md — Bloque 0 architecture document, app_tenant Postgres role (non-owner, no BYPASSRLS) (+25 more)

### Community 9 - "devDependencies"
Cohesion: 0.07
Nodes (29): autoprefixer, dotenv, jsdom, devDependencies, autoprefixer, dotenv, jsdom, postcss (+21 more)

### Community 10 - "Supabase Auth Frontend"
Cohesion: 0.21
Nodes (10): AuthGate(), useSession(), authHeader(), getAccessToken(), signInWithMagicLink(), signOut(), supabaseConfigured, queryClient (+2 more)

### Community 11 - "usage.test.js"
Cohesion: 0.23
Nodes (7): healthyRlsPolicies(), rlsPolicy(), estimateCost(), PRICE_USD_PER_MTOK, recordUsage(), recordUsageBestEffort(), $queryRaw()

### Community 12 - "Prisma Migration Tests"
Cohesion: 0.29
Nodes (5): migrationHistoryMigrationUrl, noLoginMigrationUrl, organizationWritesMigrationUrl, ownershipMigrationUrl, rlsMigrationUrl

### Community 13 - "Vercel Function Config"
Cohesion: 0.29
Nodes (6): maxDuration, maxDuration, functions, api/analyze.js, api/pliegos/[id]/presentation.js, $schema

### Community 14 - "RLS Tenant Isolation Design"
Cohesion: 0.50
Nodes (4): Tenancy decision: shared DB + organization_id + RLS, prisma/migrations/20260726120000_rls_tenant_isolation (referenced migration), RLS mechanism: set_config(app.org_id) + org_isolation policy, api/_lib/tenantDb.js (referenced runtime tenant-scoping client)

### Community 15 - "Auth & requireMember Design Notes"
Cohesion: 0.67
Nodes (3): Supabase magic-link auth + requireUser JWT guard (already built), AuthN/AuthZ: Supabase magic link + owner/member roles, requireMember middleware (user + membership + role check)

### Community 37 - "Bloque 3 — Implementación del multi-tenancy y onboarding"
Cohesion: 0.04
Nodes (43): 10. Scoping de pliegos y operaciones LLM, 11. API de organizaciones y equipo, 12. Onboarding en el frontend, 13.1 Creación, 13.2 Reenvío, 13.3 Fallo al enviar el correo, 13.4 Aceptación sin membership, 13.5 Revocación (+35 more)

### Community 38 - "supabaseAdmin.js"
Cohesion: 0.36
Nodes (6): adminConfig(), authInviteError(), EXISTING_USER_ERROR_CODES, getSupabaseAdmin(), getUserEmails(), inviteUserByEmail()

## Knowledge Gaps
- **162 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+157 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `analyze.js` to `dependencies`?**
  _High betweenness centrality (0.169) - this node is a cross-community bridge._
- **Why does `@prisma/client` connect `dependencies` to `analyze.js`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _162 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `isolation.integration.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09016393442622951 - nodes in this community are weakly interconnected._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09994155464640561 - nodes in this community are weakly interconnected._
- **Should `Analysis.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07894736842105263 - nodes in this community are weakly interconnected._
- **Should `phase4.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06874669487043893 - nodes in this community are weakly interconnected._