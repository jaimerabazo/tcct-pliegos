# Documentación

La documentación técnica y las decisiones de arquitectura viven en esta carpeta. El
`README.md` de la raíz queda reservado para presentar el proyecto y arrancarlo en local.

## Estado

- **Bloques 0–2:** completados.
- **Bloque 3:** fases 1–4 completadas; fase 5 (contract + RLS) y fase 6 (suite de
  aislamiento cross-tenant) pendientes.

## Documentos

- [Arquitectura SaaS](./ARQUITECTURA-SAAS.md): visión del producto, decisiones
  transversales y roadmap.
- [Bloque 1 — Diseño de tenancy, RBAC y RLS](./BLOQUE-1-DISENO-TENANCY.md): modelo y
  contrato de seguridad objetivo.
- [Bloque 2 — Entornos y migraciones](./BLOQUE-2-ENTORNOS.md): dev, staging, variables,
  pipeline y operación de Prisma.
- [Bloque 3 — Implementación del multi-tenancy](./BLOQUE-3-IMPLEMENTACION-TENANCY.md):
  estrategia en seis fases, código entregado, onboarding, invitaciones y trabajo
  pendiente.
