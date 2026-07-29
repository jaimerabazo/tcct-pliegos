// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { APP_TENANT_ROLE, findPolicyContractBreach, withTenant, withUser } from './tenantDb.js';
import { healthyRlsPolicies, rlsPolicy } from './testRlsPolicies.js';

// Huella de políticas de una base sana, escrita a mano (no derivada del código bajo
// prueba): ver api/_lib/testRlsPolicies.js.
const policy = rlsPolicy;
const healthyPolicies = healthyRlsPolicies;

function tenantClient(protectionsReady, roleSafe = true, contractDeployed = protectionsReady, policies = healthyPolicies()) {
  const client = {
    $transaction: vi.fn((callback) => callback(client)),
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ contractDeployed, protectionsReady, roleSafe, policies }]),
    $executeRawUnsafe: vi.fn(async () => 1),
  };
  return client;
}

describe('withTenant — despliegue compatible de RLS', () => {
  it('sirve la operación sin SET ROLE mientras la migración aún no está lista', async () => {
    const client = tenantClient(false);
    const callback = vi.fn(async () => 'resultado');

    await expect(withTenant(client, 'org-a', callback)).resolves.toBe('resultado');

    expect(client.$executeRaw).toHaveBeenCalledOnce();
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith(client);
  });

  it('activa app_tenant automáticamente cuando la migración ya está lista', async () => {
    const client = tenantClient(true);

    await withTenant(client, 'org-a', async () => 'resultado');

    expect(client.$executeRawUnsafe).toHaveBeenCalledWith(`SET LOCAL ROLE ${APP_TENANT_ROLE}`);
  });

  it('falla cerrado si el contrato fue desplegado pero después desaparece una política', async () => {
    const client = tenantClient(false, true, true);
    const callback = vi.fn(async () => 'resultado');

    await expect(withTenant(client, 'org-a', callback)).rejects.toThrow(/RLS.*incompleto/i);

    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('falla cerrado si las políticas existen pero app_tenant tiene capacidades inseguras', async () => {
    const client = tenantClient(true, false);
    const callback = vi.fn(async () => 'resultado');

    await expect(withTenant(client, 'org-a', callback)).rejects.toThrow(/iniciar sesión|ownership/i);

    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it('sigue fallando en voz alta si falta la organización', async () => {
    const client = tenantClient(true);

    await expect(withTenant(client, null, async () => 'resultado'))
      .rejects.toThrow(/organizationId/);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('crea un contexto de usuario para el bootstrap sin declarar una organización', async () => {
    const client = tenantClient(true);
    const callback = vi.fn(async () => 'organizaciones');

    await expect(withUser(client, 'user-a', callback)).resolves.toBe('organizaciones');

    expect(client.$executeRaw).toHaveBeenCalledOnce();
    expect(client.$executeRawUnsafe).toHaveBeenCalledWith(`SET LOCAL ROLE ${APP_TENANT_ROLE}`);
    expect(callback).toHaveBeenCalledWith(client);
  });

  it('withUser falla cerrado sin una identidad verificada', async () => {
    const client = tenantClient(true);

    await expect(withUser(client, null, async () => 'resultado')).rejects.toThrow(/userId/);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('falla cerrado si una política conserva el nombre pero pierde su expresión', async () => {
    // El caso peligroso: ALTER POLICY ... USING (true). Nombre, comando, rol y RLS siguen
    // en su sitio, así que contar políticas no detectaría nada — pero ya no filtra.
    const vaciada = healthyPolicies().map((p) => (
      p.tablename === 'Pliego' ? { ...p, qual: 'true', with_check: 'true' } : p
    ));
    const client = tenantClient(true, true, true, vaciada);
    const callback = vi.fn();

    await expect(withTenant(client, 'org-a', callback)).rejects.toThrow(/derivado.*USING/i);
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('findPolicyContractBreach', () => {
  it('acepta el contrato intacto', () => {
    expect(findPolicyContractBreach(healthyPolicies())).toBeNull();
  });

  it('detecta una política ausente', () => {
    const sinPliego = healthyPolicies().filter((p) => p.tablename !== 'Pliego');
    expect(findPolicyContractBreach(sinPliego)).toMatch(/falta.*Pliego\.tenant_isolation/);
  });

  it('detecta un USING vaciado y un WITH CHECK vaciado', () => {
    const usingRoto = healthyPolicies().map((p) => (
      p.policyname === 'tenant_select' && p.tablename === 'audit_log' ? { ...p, qual: 'true' } : p
    ));
    expect(findPolicyContractBreach(usingRoto)).toMatch(/USING/);

    const checkRoto = healthyPolicies().map((p) => (
      p.policyname === 'tenant_insert' && p.tablename === 'usage_events' ? { ...p, with_check: 'true' } : p
    ));
    expect(findPolicyContractBreach(checkRoto)).toMatch(/WITH CHECK/);
  });

  it('detecta una política permissive de más (en Postgres se combinan con OR: amplía el acceso)', () => {
    const conColada = [
      ...healthyPolicies(),
      policy('Pliego', 'colada', 'SELECT', 'true', null),
    ];
    expect(findPolicyContractBreach(conColada)).toMatch(/no prevista.*colada/);
  });

  it('tolera una política RESTRICTIVE extra: solo puede restringir, nunca abrir', () => {
    const conRestrictiva = [
      ...healthyPolicies(),
      { ...policy('Pliego', 'extra_restrictiva', 'SELECT', 'false', null), permissive: 'RESTRICTIVE' },
    ];
    expect(findPolicyContractBreach(conRestrictiva)).toBeNull();
  });

  it('detecta una política que ya no está limitada a app_tenant', () => {
    const aPublic = healthyPolicies().map((p) => (
      p.tablename === 'invitations' ? { ...p, roles: '{public}' } : p
    ));
    expect(findPolicyContractBreach(aPublic)).toMatch(/no está limitada/);
  });

  it('detecta un comando cambiado (una política ALL degradada a SELECT deja de cubrir escrituras)', () => {
    const cmdRoto = healthyPolicies().map((p) => (
      p.tablename === 'memberships' && p.policyname === 'tenant_isolation' ? { ...p, cmd: 'SELECT' } : p
    ));
    expect(findPolicyContractBreach(cmdRoto)).toMatch(/aplica a SELECT/);
  });

  it('ignora diferencias de espaciado del deparse de Postgres', () => {
    const conEspacios = healthyPolicies().map((p) => ({
      ...p,
      qual: p.qual ? p.qual.replace(/ = /g, '  =  ') : p.qual,
    }));
    expect(findPolicyContractBreach(conEspacios)).toBeNull();
  });
});
