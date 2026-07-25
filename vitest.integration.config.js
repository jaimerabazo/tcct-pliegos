import { defineConfig } from 'vitest/config';

// Suite de INTEGRACIÓN: corre contra un Postgres REAL (contenedor efímero en CI, o
// cualquier BD de desarrollo en local). Separada de la suite unitaria a propósito:
//   - la unitaria (vitest.config.js) usa dobles en memoria y no toca la red ni la BD,
//     así que sigue siendo rápida y ejecutable sin infraestructura;
//   - esta valida lo que un doble NO puede validar: constraints, cascadas y —desde la
//     fase 5b— las políticas RLS de Postgres, que solo existen en el motor real.
//
// Se lanza con `npm run test:integration` y necesita DATABASE_URL.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.integration.test.js'],
    // Las pruebas comparten una BD: en paralelo se pisarían entre ellas.
    fileParallelism: false,
    // Crear orgs, aplicar migraciones y hablar con una BD remota es más lento que un doble.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
