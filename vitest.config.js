import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    // Env FAKE de Supabase para que los tests sean deterministas en local y CI (vitest
    // no carga .env.local). Nunca se toca la red: los tests que ejercitan supabase-js
    // mockean global.fetch, y getSession/signOut sin sesión son locales (storage).
    env: {
      VITE_SUPABASE_URL: 'https://test-project.supabase.local',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/logic.js',
        'src/api/pliegos.js',
        'src/api/http.js',
        'src/api/orgs.js',
        'api/_lib/schemas.js',
        'api/_lib/auth.js',
        'api/_lib/authz.js',
        'api/_lib/usage.js',
        'api/_lib/organizations.js',
        'api/_lib/presentationBuilder.js',
        'api/pliegos/index.js',
        'api/pliegos/[id].js',
        'api/pliegos/[id]/analysis.js',
        'api/orgs/index.js',
        'api/orgs/[id]/invitations.js',
        'api/orgs/[id]/members/index.js',
        'api/orgs/[id]/members/[userId].js',
        'api/invitations/accept.js',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
