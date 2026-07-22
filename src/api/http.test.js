import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { apiFetch, jsonOrThrow, getActiveOrgId, setActiveOrgId, ACTIVE_ORG_KEY } from './http.js';
import { listMyOrgs } from './orgs.js';

// Basta con mockear global.fetch y manipular el localStorage real de jsdom. Cero vi.mock,
// como en el resto del repo.

function mockFetchOnce({ ok = true, status = 200, body } = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('org activa (localStorage)', () => {
  it('sin nada guardado, getActiveOrgId devuelve null', () => {
    expect(getActiveOrgId()).toBeNull();
  });

  it('setActiveOrgId guarda y getActiveOrgId la recupera', () => {
    setActiveOrgId('org-42');
    expect(getActiveOrgId()).toBe('org-42');
    expect(localStorage.getItem(ACTIVE_ORG_KEY)).toBe('org-42');
  });

  it('setActiveOrgId(null) la borra', () => {
    setActiveOrgId('org-42');
    setActiveOrgId(null);
    expect(getActiveOrgId()).toBeNull();
  });
});

describe('apiFetch', () => {
  it('adjunta X-Organization-Id cuando hay org activa', async () => {
    setActiveOrgId('org-42');
    mockFetchOnce({ body: [] });
    await apiFetch('/api/pliegos');
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['X-Organization-Id']).toBe('org-42');
  });

  it('NO adjunta la cabecera si no hay org activa (bootstrap: /api/orgs no la necesita)', async () => {
    mockFetchOnce({ body: [] });
    await apiFetch('/api/orgs');
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['X-Organization-Id']).toBeUndefined();
  });

  it('las cabeceras del llamante se conservan junto a las automáticas', async () => {
    setActiveOrgId('org-42');
    mockFetchOnce({ body: {} });
    await apiFetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/pdf' } });
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers['Content-Type']).toBe('application/pdf');
    expect(opts.headers['X-Organization-Id']).toBe('org-42');
    expect(opts.method).toBe('POST');
  });

  it('devuelve la respuesta tal cual en un 401 sin destruir la sesión', async () => {
    mockFetchOnce({ ok: false, status: 401, body: { error: 'No autorizado.' } });
    const res = await apiFetch('/api/pliegos');
    expect(res.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('jsonOrThrow', () => {
  it('devuelve el JSON cuando la respuesta es ok', async () => {
    await expect(jsonOrThrow({ ok: true, json: async () => ({ x: 1 }) }, 'Fallo')).resolves.toEqual({ x: 1 });
  });

  it('lanza el error del servidor cuando lo hay', async () => {
    const res = { ok: false, status: 403, json: async () => ({ error: 'No perteneces a esta organización.' }) };
    await expect(jsonOrThrow(res, 'Fallo')).rejects.toThrow(/No perteneces/);
  });

  it('usa el fallback si el cuerpo no es JSON parseable', async () => {
    const res = { ok: false, status: 500, json: async () => { throw new Error('not json'); } };
    await expect(jsonOrThrow(res, 'Fallo genérico')).rejects.toThrow(/HTTP 500/);
  });
});

describe('listMyOrgs (cliente)', () => {
  it('devuelve las orgs del servidor', async () => {
    mockFetchOnce({ body: [{ id: 'org-a', name: 'Org A', role: 'owner' }] });
    const orgs = await listMyOrgs();
    expect(orgs).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith('/api/orgs', expect.any(Object));
  });

  it('propaga el error del servidor', async () => {
    mockFetchOnce({ ok: false, status: 500, body: { error: 'Fallo del servidor.' } });
    await expect(listMyOrgs()).rejects.toThrow('Fallo del servidor.');
  });
});
