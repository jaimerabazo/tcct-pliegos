// Puente entre el guard de la aplicación y el RLS de Postgres (fase 5b).
//
// Toda operación sobre datos de cliente debe pasar por `withTenant`: abre una transacción,
// se cambia al rol `app_tenant` (que NO puede saltarse las políticas) y declara qué
// organización está activa. A partir de ahí es el motor —no el código— quien garantiza
// que no se lea ni se escriba nada de otro tenant.
//
// Por qué una transacción y no una variable de sesión: con el pooler, la misma conexión
// física sirve a peticiones de tenants distintos. `SET LOCAL` y `set_config(..., true)`
// se revierten al cerrar la transacción, así que el contexto no puede filtrarse a la
// siguiente petición. Una variable de sesión sí se filtraría — y sería una fuga.

// El rol lo crea la migración 20260726120000_rls_tenant_isolation. Es una constante del
// sistema, nunca entrada de usuario: `SET LOCAL ROLE` no admite parámetros y hay que
// interpolarlo, así que mantenerlo como literal cerrado es lo que lo hace seguro.
export const APP_TENANT_ROLE = 'app_tenant';

// Ejecuta `callback` con un cliente Prisma restringido a `organizationId`.
//
//   const pliegos = await withTenant(prisma, ctx.orgId, (db) => listPliegos(db, ctx.orgId));
//
// El `where organizationId` explícito de los handlers NO desaparece: sigue siendo la
// Capa 2. Esto es la Capa 3, la que aguanta cuando la 2 falla.
export async function withTenant(client, organizationId, callback) {
  if (!organizationId) {
    // Fail-closed y ruidoso: sin organización, el RLS devolvería 0 filas silenciosamente
    // y el síntoma ("no veo mis datos") sería difícil de rastrear hasta aquí.
    throw new Error('withTenant requiere una organizationId.');
  }

  // El doble en memoria de los tests unitarios implementa $transaction/$executeRaw* como
  // no-ops, así que este mismo camino sirve con y sin Postgres detrás — sin ramas
  // especiales que dejarían el código de producción sin ejercitar. El aislamiento real
  // que producen estas dos sentencias se verifica en tests/integration.
  return client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${APP_TENANT_ROLE}`);
    await tx.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
    return callback(tx);
  });
}
