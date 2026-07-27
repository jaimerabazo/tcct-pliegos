// Suite de AISLAMIENTO CROSS-TENANT contra Postgres real (docs/BLOQUE-1 §6).
//
// Es el test más importante del producto: convierte "ninguna organización puede ver los
// datos de otra" en un contrato verificado en cada PR. Los tests unitarios ya cubren esto
// con dobles en memoria; aquí lo ejercitamos contra el motor de verdad, que es donde
// viven las constraints, las cascadas y —desde la fase 5b— las políticas RLS.
//
// Fixture (el del doc): Org A (owner Ana, member Marc) · Org B (owner Berta), con pliegos
// en ambas. Berta es "el otro cliente": todo lo que intente sobre datos de A debe fallar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import listPliegosHandler from '../../api/pliegos/index.js';
import pliegoByIdHandler from '../../api/pliegos/[id].js';
import analysisHandler from '../../api/pliegos/[id]/analysis.js';
import { persistAnalysis } from '../../api/analyze.js';
import invitationsHandler from '../../api/orgs/[id]/invitations.js';
import { createFakeRes } from '../../api/_lib/testFakeRes.js';
import { authHeaders } from '../../api/_lib/testAuth.js';
import { MOCK_ANALYSIS } from '../../prisma/seed.js';
import { createOrgFixture, createTestPrisma, cleanupOrgs, testId } from './helpers/testDb.js';

// Análisis con forma válida: el handler valida el body ANTES de comprobar la pertenencia,
// así que un body inválido daría 400 sin llegar al guard scoped (ese 400 no filtra nada:
// se obtiene igual exista o no el pliego). Para probar el aislamiento hace falta un body
// que supere la validación y llegue hasta la query scoped.
const ANALISIS_VALIDO = MOCK_ANALYSIS['2026-7008'];

const prisma = createTestPrisma();

const ANA = { userId: testId('ana'), email: 'ana@org-a.test' };
const MARC = { userId: testId('marc'), email: 'marc@org-a.test' };
const BERTA = { userId: testId('berta'), email: 'berta@org-b.test' };

let orgA;
let orgB;
// Cabeceras completas (JWT válido + org activa) tal y como las manda el frontend real.
let anaHeaders;
let marcHeaders;
let bertaHeaders;

beforeAll(async () => {
  orgA = await createOrgFixture(prisma, {
    label: 'org-a',
    members: [{ ...ANA, role: 'owner' }, { ...MARC, role: 'member' }],
    pliegos: [{ titulo: 'Pliego confidencial de A' }, { titulo: 'Segundo pliego de A' }],
  });
  orgB = await createOrgFixture(prisma, {
    label: 'org-b',
    members: [{ ...BERTA, role: 'owner' }],
    pliegos: [{ titulo: 'Pliego de B' }],
  });

  const asUser = async (user, organizationId) => ({
    ...(await authHeaders({ sub: user.userId, email: user.email })),
    'x-organization-id': organizationId,
  });
  anaHeaders = await asUser(ANA, orgA.organizationId);
  marcHeaders = await asUser(MARC, orgA.organizationId);
  bertaHeaders = await asUser(BERTA, orgB.organizationId);
});

afterAll(async () => {
  await cleanupOrgs(prisma, [orgA?.organizationId, orgB?.organizationId].filter(Boolean));
  await prisma.$disconnect();
});

describe('aislamiento cross-tenant (Postgres real)', () => {
  it('Berta solo ve los pliegos de su organización, nunca los de A', async () => {
    const res = createFakeRes();
    await listPliegosHandler({ method: 'GET', headers: bertaHeaders }, res, prisma);

    expect(res.statusCode).toBe(200);
    const ids = res.body.map((pliego) => pliego.id);
    expect(ids).toContain(orgB.pliegos[0].id);
    orgA.pliegos.forEach((pliego) => expect(ids).not.toContain(pliego.id));
  });

  it('Ana ve los suyos y tampoco los de B (el aislamiento va en ambos sentidos)', async () => {
    const res = createFakeRes();
    await listPliegosHandler({ method: 'GET', headers: anaHeaders }, res, prisma);

    expect(res.statusCode).toBe(200);
    const ids = res.body.map((pliego) => pliego.id);
    expect(ids).toEqual(expect.arrayContaining(orgA.pliegos.map((pliego) => pliego.id)));
    expect(ids).not.toContain(orgB.pliegos[0].id);
  });

  it('Berta pidiendo un pliego de A recibe 404, no 403 (no revelar ni la existencia)', async () => {
    const res = createFakeRes();
    await pliegoByIdHandler(
      { method: 'GET', headers: bertaHeaders, query: { id: orgA.pliegos[0].id } },
      res,
      prisma,
    );

    expect(res.statusCode).toBe(404);
  });

  it('Berta editando un pliego de A recibe 404 y el pliego queda intacto', async () => {
    const objetivo = orgA.pliegos[0];
    const res = createFakeRes();
    await pliegoByIdHandler(
      {
        method: 'PATCH',
        headers: bertaHeaders,
        query: { id: objetivo.id },
        body: { titulo: 'Secuestrado por B' },
      },
      res,
      prisma,
    );

    expect(res.statusCode).toBe(404);
    const enBd = await prisma.pliego.findUnique({ where: { id: objetivo.id } });
    expect(enBd.titulo).toBe(objetivo.titulo);
    expect(enBd.organizationId).toBe(orgA.organizationId);
  });

  it('Berta editando el análisis de un pliego de A recibe 404 y no lo altera', async () => {
    const objetivo = orgA.pliegos[0];
    const res = createFakeRes();
    await analysisHandler(
      {
        method: 'PATCH',
        headers: bertaHeaders,
        query: { id: objetivo.id },
        body: ANALISIS_VALIDO,
      },
      res,
      prisma,
    );

    expect(res.statusCode).toBe(404);
    const enBd = await prisma.pliego.findUnique({ where: { id: objetivo.id } });
    expect(enBd.analysisData).toBeNull();
  });

  it('una org que no es la tuya se rechaza con 403 aunque el pliego exista ahí', async () => {
    const headers = {
      ...(await authHeaders({ sub: BERTA.userId, email: BERTA.email })),
      'x-organization-id': orgA.organizationId, // Berta AFIRMA ser de A
    };
    const res = createFakeRes();
    await listPliegosHandler({ method: 'GET', headers }, res, prisma);

    expect(res.statusCode).toBe(403);
  });

  it('sin cabecera X-Organization-Id la petición es 400 (malformada)', async () => {
    const res = createFakeRes();
    await listPliegosHandler(
      { method: 'GET', headers: await authHeaders({ sub: ANA.userId, email: ANA.email }) },
      res,
      prisma,
    );

    expect(res.statusCode).toBe(400);
  });
});

describe('RBAC owner/member (Postgres real)', () => {
  // El envío del email es IO externo: se inyecta un doble para no depender de Supabase.
  const noopInvite = async () => {};
  const env = { APP_URL: 'https://app.test' };

  it('Marc (member) no puede invitar: 403', async () => {
    const res = createFakeRes();
    await invitationsHandler(
      {
        method: 'POST',
        headers: marcHeaders,
        query: { id: orgA.organizationId },
        body: { email: 'nuevo@org-a.test', role: 'member' },
      },
      res,
      prisma,
      { inviteUser: noopInvite, env },
    );

    expect(res.statusCode).toBe(403);
  });

  it('Ana (owner) sí puede invitar: 201 y la invitación queda pendiente en su org', async () => {
    const res = createFakeRes();
    await invitationsHandler(
      {
        method: 'POST',
        headers: anaHeaders,
        query: { id: orgA.organizationId },
        body: { email: 'nuevo@org-a.test', role: 'member' },
      },
      res,
      prisma,
      { inviteUser: noopInvite, env },
    );

    expect(res.statusCode).toBe(201);
    const pendientes = await prisma.invitation.findMany({
      where: { organizationId: orgA.organizationId, acceptedAt: null },
    });
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].email).toBe('nuevo@org-a.test');
    // El token en claro nunca se persiste: en BD solo vive su hash.
    expect(pendientes[0].tokenHash).not.toBe(res.body?.token);
  });

  it('Berta no puede listar las invitaciones de A (403 por membership)', async () => {
    const headers = {
      ...(await authHeaders({ sub: BERTA.userId, email: BERTA.email })),
      'x-organization-id': orgA.organizationId,
    };
    const res = createFakeRes();
    await invitationsHandler(
      { method: 'GET', headers, query: { id: orgA.organizationId } },
      res,
      prisma,
      { inviteUser: noopInvite, env },
    );

    expect(res.statusCode).toBe(403);
  });
});

describe('escritura principal de /api/analyze (Postgres real)', () => {
  it('persistAnalysis guarda el mismo expediente separado para A y B', async () => {
    const expediente = `2026/ANALYZE-${Date.now()}`;
    const result = {
      pliego: {
        expediente,
        titulo: 'Pliego analizado para dos organizaciones',
        organismo: 'Organismo de prueba',
        importe: 1000000,
        lotes: 1,
        fechaLimite: '15 jul 2026',
        procedimiento: 'Abierto',
        ens: 'Alto',
      },
      analysis: ANALISIS_VALIDO,
    };

    await persistAnalysis(prisma, result, {
      organizationId: orgA.organizationId,
      userId: ANA.userId,
    });
    await persistAnalysis(prisma, result, {
      organizationId: orgB.organizationId,
      userId: BERTA.userId,
    });

    const [enA, enB] = await Promise.all([
      prisma.pliego.findUnique({
        where: {
          organizationId_expediente: {
            organizationId: orgA.organizationId,
            expediente,
          },
        },
      }),
      prisma.pliego.findUnique({
        where: {
          organizationId_expediente: {
            organizationId: orgB.organizationId,
            expediente,
          },
        },
      }),
    ]);

    expect(enA).toMatchObject({
      organizationId: orgA.organizationId,
      expediente,
      createdBy: ANA.userId,
    });
    expect(enB).toMatchObject({
      organizationId: orgB.organizationId,
      expediente,
      createdBy: BERTA.userId,
    });
    expect(enA.id).not.toBe(enB.id);
  });
});

describe('integridad del modelo (lo que un doble en memoria no puede verificar)', () => {
  it('si createOrgFixture falla a mitad, revierte también la organización', async () => {
    const label = testId('rollback-fixture');
    const duplicatedUserId = testId('duplicated-member');

    await expect(createOrgFixture(prisma, {
      label,
      // La segunda membership viola la PK compuesta y fuerza un fallo después de
      // haber intentado crear la organización y la primera membership.
      members: [
        { userId: duplicatedUserId, role: 'owner' },
        { userId: duplicatedUserId, role: 'member' },
      ],
    })).rejects.toMatchObject({ code: 'P2002' });

    expect(await prisma.organization.findFirst({
      where: { name: `Org ${label}` },
    })).toBeNull();
  });

  it('el mismo expediente puede existir en dos organizaciones distintas', async () => {
    const expediente = `2026/COMPARTIDO-${Date.now()}`;
    const enA = await prisma.pliego.create({
      data: {
        organizationId: orgA.organizationId,
        expediente,
        titulo: 'Mismo pliego público',
        organismo: 'Organismo',
        lotes: 1,
        estado: 'analizado',
        procedimiento: 'Abierto',
        ens: 'Alto',
      },
    });
    const enB = await prisma.pliego.create({
      data: {
        organizationId: orgB.organizationId,
        expediente,
        titulo: 'Mismo pliego público',
        organismo: 'Organismo',
        lotes: 1,
        estado: 'analizado',
        procedimiento: 'Abierto',
        ens: 'Alto',
      },
    });

    expect(enA.id).not.toBe(enB.id);

    // ...pero repetirlo DENTRO de la misma organización sí viola el unique compuesto.
    await expect(prisma.pliego.create({
      data: {
        organizationId: orgA.organizationId,
        expediente,
        titulo: 'Duplicado en la misma org',
        organismo: 'Organismo',
        lotes: 1,
        estado: 'analizado',
        procedimiento: 'Abierto',
        ens: 'Alto',
      },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('borrar una organización arrastra sus datos (cascada real del schema)', async () => {
    const efimera = await createOrgFixture(prisma, {
      label: 'cascada',
      members: [{ userId: testId('user'), role: 'owner' }],
      pliegos: [{ titulo: 'Pliego efímero' }],
    });

    await cleanupOrgs(prisma, [efimera.organizationId]);

    expect(await prisma.pliego.findUnique({ where: { id: efimera.pliegos[0].id } })).toBeNull();
    expect(await prisma.membership.findMany({
      where: { organizationId: efimera.organizationId },
    })).toHaveLength(0);
  });
});
