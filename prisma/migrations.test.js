// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rlsMigrationUrl = new URL(
  './migrations/20260728120000_complete_tenant_rls_contract/migration.sql',
  import.meta.url,
);
const ownershipMigrationUrl = new URL(
  './migrations/20260728130000_reject_app_tenant_ownership/migration.sql',
  import.meta.url,
);
const noLoginMigrationUrl = new URL(
  './migrations/20260728140000_reject_login_app_tenant/migration.sql',
  import.meta.url,
);
const organizationWritesMigrationUrl = new URL(
  './migrations/20260728150000_restrict_organization_writes/migration.sql',
  import.meta.url,
);
const migrationHistoryMigrationUrl = new URL(
  './migrations/20260728160000_protect_rls_capability_signal/migration.sql',
  import.meta.url,
);

function sqlWithoutComments(url) {
  return readFileSync(url, 'utf8').replace(/--.*$/gm, '').trim();
}

describe('migración de contrato RLS', () => {
  it('envuelve todos sus cambios y verificaciones en una transacción explícita', () => {
    const sql = sqlWithoutComments(rlsMigrationUrl);

    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toMatch(/COMMIT;$/);
    expect(sql.lastIndexOf('RAISE EXCEPTION')).toBeLessThan(sql.lastIndexOf('COMMIT;'));
  });

  it('rechaza atributos y ownership directo o heredado de app_tenant', () => {
    const sql = sqlWithoutComments(ownershipMigrationUrl);

    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toMatch(/COMMIT;$/);
    expect(sql).toContain('rolcreaterole');
    expect(sql).toContain('c.relowner = app_role_oid');
    expect(sql).toContain("pg_has_role(app_role_oid, c.relowner, 'MEMBER')");
  });

  it('rechaza que app_tenant pueda conectarse directamente a la base de datos', () => {
    const sql = sqlWithoutComments(noLoginMigrationUrl);

    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toMatch(/COMMIT;$/);
    expect(sql).toContain('rolcanlogin');
    expect(sql).toContain('RAISE EXCEPTION');
  });

  it('retira únicamente las escrituras innecesarias sobre organizations', () => {
    const sql = sqlWithoutComments(organizationWritesMigrationUrl);

    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toMatch(/COMMIT;$/);
    expect(sql).toMatch(/REVOKE UPDATE, DELETE ON TABLE public\.organizations FROM app_tenant/);
    expect(sql).toContain("has_table_privilege('app_tenant', 'public.organizations', 'UPDATE')");
    expect(sql).toContain("has_table_privilege('app_tenant', 'public.organizations', 'DELETE')");
    expect(sql).toContain("has_table_privilege('app_tenant', 'public.organizations', 'SELECT')");
    expect(sql).toContain("has_table_privilege('app_tenant', 'public.organizations', 'INSERT')");
  });

  it('impide que app_tenant altere la señal durable del contrato RLS', () => {
    const sql = sqlWithoutComments(migrationHistoryMigrationUrl);

    expect(sql).toMatch(/^BEGIN;/);
    expect(sql).toMatch(/COMMIT;$/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE public\."_prisma_migrations"/);
    expect(sql).toContain("has_table_privilege('app_tenant', 'public.\"_prisma_migrations\"', 'UPDATE')");
    expect(sql).toContain("has_table_privilege('app_tenant', 'public.\"_prisma_migrations\"', 'SELECT')");
  });
});
