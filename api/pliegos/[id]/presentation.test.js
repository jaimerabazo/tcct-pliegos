// @vitest-environment node
// (los tests de API firman JWTs con jose, que falla bajo jsdom; no necesitan DOM)
//
// El handler completo (Claude + renderPptx) se verifica a mano, no por CI — mismo
// criterio que api/analyze.js. Pero el guard de auth corre ANTES de validar el body o
// tocar Claude, así que sí se testea: es la barrera de seguridad del endpoint más caro.
import { describe, it, expect } from 'vitest';
import handler from './presentation.js';
import { createFakeRes } from '../../_lib/testFakeRes.js';
import './../../_lib/testAuth.js'; // instala el secret de test para el guard de auth

describe('handler POST /api/pliegos/[id]/presentation — auth', () => {
  it('responde 401 sin token, antes de validar el body o llamar a Claude', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: {}, body: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('responde 401 con token inválido', async () => {
    const res = createFakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer basura' }, body: {} }, res);
    expect(res.statusCode).toBe(401);
  });
});
