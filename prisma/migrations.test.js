// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const rlsMigrationUrl = new URL(
  './migrations/20260726120000_rls_tenant_isolation/migration.sql',
  import.meta.url,
);

describe('migración RLS', () => {
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
