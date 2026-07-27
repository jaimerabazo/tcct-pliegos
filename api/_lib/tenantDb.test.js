// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { APP_TENANT_ROLE, withTenant, withUser } from './tenantDb.js';

function tenantClient(canSetRole) {
  const client = {
    $transaction: vi.fn((callback) => callback(client)),
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [{ canSetRole }]),
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
});
