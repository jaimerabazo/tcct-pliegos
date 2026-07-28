// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rlsMigrationUrl = new URL(
  './migrations/20260728120000_complete_tenant_rls_contract/migration.sql',
  import.meta.url,
);

describe('migración de contrato RLS', () => {
  it('envuelve todos sus cambios y verificaciones en una transacción explícita', () => {
    const sqlWithoutComments = readFileSync(rlsMigrationUrl, 'utf8')
      .replace(/--.*$/gm, '')
      .trim();

    expect(sqlWithoutComments).toMatch(/^BEGIN;/);
    expect(sqlWithoutComments).toMatch(/COMMIT;$/);
    expect(sqlWithoutComments.lastIndexOf('RAISE EXCEPTION'))
      .toBeLessThan(sqlWithoutComments.lastIndexOf('COMMIT;'));
  });
});
