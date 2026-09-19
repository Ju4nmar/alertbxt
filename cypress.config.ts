import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    // CI es más lento que un equipo local y los emuladores arrancan en frío:
    // un tope de espera más holgado y un reintento evitan falsos rojos sin
    // esconder fallos reales (un bug real falla también en el reintento).
    defaultCommandTimeout: 8000,
    retries: { runMode: 2, openMode: 0 },
  },
});
