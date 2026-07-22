// Las claves de datos tenant incluyen siempre la identidad que determina su alcance.
// El QueryClient vive durante toda la sesión de la SPA, también cuando cambia el
// usuario, por lo que una clave global podría publicar datos cacheados de otra sesión.
export const tenantQueryKeys = {
  orgs: (userId) => ['orgs', userId],
  pliegos: (userId, orgId) => ['pliegos', userId, orgId],
};
