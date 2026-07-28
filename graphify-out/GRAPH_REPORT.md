# Graph Report - .  (2026-07-28)

## Corpus Check
- 113 files · ~70,137 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 540 nodes · 1188 edges · 37 communities (23 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.7)
- Token cost: 0 input · 110,125 output

## Community Hubs (Navigation)
- Multi-Tenant Auth API & Isolation Tests
- Org Onboarding & App Shell (Frontend)
- Pliego Analysis & Dashboard UI
- API Test Suites (Auth/Usage/Tenancy)
- Production Dependencies (package.json)
- Analysis Ingestion & Zod Schemas
- PPTX Renderer & Pagination
- Presentation Builder & Endpoint
- SaaS Tenancy Docs & CI/CD Pipeline
- Dev Dependencies (package.json)
- Supabase Auth Frontend
- Supabase Admin Invitations
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

## God Nodes (most connected - your core abstractions)
1. `withTenant()` - 24 edges
2. `requireMember()` - 22 edges
3. `apiFetch()` - 19 edges
4. `createFakePliegoPrisma()` - 18 edges
5. `jsonOrThrow()` - 16 edges
6. `Analysis()` - 15 edges
7. `scripts` - 14 edges
8. `authHeaders()` - 13 edges
9. `handler()` - 13 edges
10. `theme` - 13 edges

## Surprising Connections (you probably didn't know these)
- `buildPerfilesBlocks()` --calls--> `formatNumber()`  [EXTRACTED]
  api/_lib/presentationBuilder.js → src/logic.js
- `buildCoverSpec()` --calls--> `formatNumber()`  [EXTRACTED]
  api/_lib/presentationBuilder.js → src/logic.js
- `main()` --references--> `@prisma/client`  [EXTRACTED]
  prisma/seed.js → package.json
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

## Communities (37 total, 14 thin omitted)

### Community 0 - "Multi-Tenant Auth API & Isolation Tests"
Cohesion: 0.08
Nodes (52): handler(), authConfigured(), encoder, getRemoteJwks(), getUserFromRequest(), requireUser(), supabaseBaseUrl(), verificationKey() (+44 more)

### Community 1 - "Org Onboarding & App Shell (Frontend)"
Cohesion: 0.10
Nodes (32): apiFetch(), getActiveOrgId(), jsonOrThrow(), setActiveOrgId(), acceptInvitation(), createInvitation(), createOrganization(), listMembers() (+24 more)

### Community 2 - "Pliego Analysis & Dashboard UI"
Cohesion: 0.08
Nodes (38): FieldLabel(), fieldStyle, NumberField(), SelectField(), TextAreaField(), TextField(), ConfidenceBadge(), EditButton() (+30 more)

### Community 3 - "API Test Suites (Auth/Usage/Tenancy)"
Cohesion: 0.07
Nodes (37): fakeClient(), ORG, ORG_BORRADA, reqFor(), authHeaders(), encoder, signTestToken(), TEST_USER (+29 more)

### Community 4 - "Production Dependencies (package.json)"
Cohesion: 0.05
Nodes (43): @anthropic-ai/sdk, jose, lucide-react, dependencies, @anthropic-ai/sdk, jose, lucide-react, pg (+35 more)

### Community 5 - "Analysis Ingestion & Zod Schemas"
Cohesion: 0.09
Nodes (35): config, getAnthropicResult(), getClientErrorMessage(), handler(), persistAnalysis(), PLIEGO_ANALYSIS_SCHEMA, readRequestBody(), CTX_A (+27 more)

### Community 6 - "PPTX Renderer & Pagination"
Cohesion: 0.13
Nodes (38): addContentHeader(), addFooter(), bodySpan(), charsPerLine(), estimateBlockHeight(), estimateBulletItemHeight(), estimateBulletItemHeights(), estimateBulletsBlockHeight() (+30 more)

### Community 7 - "Presentation Builder & Endpoint"
Cohesion: 0.12
Nodes (32): buildCoverSpec(), buildCriteriosBlocks(), buildFinalSpec(), buildLotesBlocks(), buildPenalizacionesBlocks(), buildPerfilesBlocks(), buildPlazosBlocks(), buildResumenBlocks() (+24 more)

### Community 8 - "SaaS Tenancy Docs & CI/CD Pipeline"
Cohesion: 0.07
Nodes (33): Bloque 3 multi-tenancy in progress (feat/tenancy branch series), Pivot to commercial B2B SaaS (from internal TCCT tool), Prisma 7 + Supabase pooler gotchas (IPv6 Direct, driver adapter), Analizador de Pliegos / TCCT Pliegos project, Typography: Space Grotesk + Inter + JetBrains Mono, v1 data model (organizations/memberships/invitations/pliegos/usage_events/audit_log), ARQUITECTURA-SAAS.md — Bloque 0 architecture document, app_tenant Postgres role (non-owner, no BYPASSRLS) (+25 more)

### Community 9 - "Dev Dependencies (package.json)"
Cohesion: 0.07
Nodes (29): autoprefixer, dotenv, jsdom, devDependencies, autoprefixer, dotenv, jsdom, postcss (+21 more)

### Community 10 - "Supabase Auth Frontend"
Cohesion: 0.21
Nodes (10): AuthGate(), useSession(), authHeader(), getAccessToken(), signInWithMagicLink(), signOut(), supabaseConfigured, queryClient (+2 more)

### Community 11 - "Supabase Admin Invitations"
Cohesion: 0.36
Nodes (6): adminConfig(), authInviteError(), EXISTING_USER_ERROR_CODES, getSupabaseAdmin(), getUserEmails(), inviteUserByEmail()

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

## Knowledge Gaps
- **126 isolated node(s):** `encoder`, `ORG`, `ORG_BORRADA`, `SECTION_LABELS`, `SECTION_BUILDERS` (+121 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `Analysis Ingestion & Zod Schemas` to `Production Dependencies (package.json)`?**
  _High betweenness centrality (0.196) - this node is a cross-community bridge._
- **Why does `@prisma/client` connect `Production Dependencies (package.json)` to `Analysis Ingestion & Zod Schemas`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **What connects `encoder`, `ORG`, `ORG_BORRADA` to the rest of the system?**
  _126 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Multi-Tenant Auth API & Isolation Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.07848944835246205 - nodes in this community are weakly interconnected._
- **Should `Org Onboarding & App Shell (Frontend)` be split into smaller, more focused modules?**
  _Cohesion score 0.1005260081823495 - nodes in this community are weakly interconnected._
- **Should `Pliego Analysis & Dashboard UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07894736842105263 - nodes in this community are weakly interconnected._
- **Should `API Test Suites (Auth/Usage/Tenancy)` be split into smaller, more focused modules?**
  _Cohesion score 0.07205387205387205 - nodes in this community are weakly interconnected._