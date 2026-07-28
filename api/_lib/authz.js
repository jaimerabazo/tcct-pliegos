// Guard de AUTORIZACIÓN multi-tenant (Bloque 3) — evolución de requireUser (auth.js).
// Diseño en docs/BLOQUE-1-DISENO-TENANCY.md §3. La secuencia responde a una semántica
// de códigos deliberada:
//   401 → fallo de IDENTIDAD (no sé quién eres)         — lo emite requireUser
//   400 → petición malformada (falta la org)             — el frontend siempre la manda
//   403 → fallo de PERMISO (sé quién eres, y no puedes)  — sin membership, org
//         desactivada, o rol insuficiente
// El 404 de "recurso de otra org" NO vive aquí: lo produce la query scoped del handler
// (WHERE id AND organizationId no devuelve nada) — no revelar ni la existencia.
//
// El header X-Organization-Id es una AFIRMACIÓN del cliente que aquí se verifica
// SIEMPRE contra memberships; jamás se confía en él.
import { prisma } from './prisma.js';
import { requireUser } from './auth.js';
import { withUser } from './tenantDb.js';

// Guard para usar al principio de cada handler scoped:
//   const ctx = await requireMember(req, res, { client });            // cualquier miembro
//   const ctx = await requireMember(req, res, { client, role: 'owner' }); // solo owners
//   if (!ctx) return; // requireMember ya ha respondido 400/401/403/500
// Devuelve el contexto de request: { user, orgId, role }.
// `client` es inyectable para tests (doble de testFakePrisma.js); en producción los
// handlers le pasan el suyo o cae al singleton real.
export async function requireMember(req, res, opts = {}) {
  const { client = prisma, role, ...authOpts } = opts;

  const user = await requireUser(req, res, authOpts);
  if (!user) return null; // requireUser ya ha respondido 401/500

  const orgId = req.headers?.['x-organization-id'];
  if (!orgId) {
    res.status(400).json({ error: 'Falta la cabecera X-Organization-Id.' });
    return null;
  }

  let membership;
  try {
    membership = await withUser(client, user.id, (db) => db.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
      include: { organization: true },
    }));
  } catch (err) {
    // El guard corre antes del try/catch propio de los handlers. Resolver aquí los
    // fallos de Prisma evita que una caída de BD termine como error no controlado de
    // la función y mantiene una respuesta JSON coherente en todos los endpoints.
    console.error('Error verificando membership:', err);
    res.status(500).json({ error: 'No se ha podido verificar el acceso a la organización.' });
    return null;
  }
  if (!membership) {
    res.status(403).json({ error: 'No perteneces a esta organización.' });
    return null;
  }

  // Decisión D3 (BLOQUE-1 §5): una org borrada (soft-delete, en ventana de purga) se
  // rechaza aquí, en un único punto, en vez de filtrar deletedAt en cada query.
  if (membership.organization?.deletedAt) {
    res.status(403).json({ error: 'Organización desactivada.' });
    return null;
  }

  if (role === 'owner' && membership.role !== 'owner') {
    res.status(403).json({ error: 'Esta acción requiere ser owner de la organización.' });
    return null;
  }

  return { user, orgId, role: membership.role };
}
