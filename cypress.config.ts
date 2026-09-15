import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:4200',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    env: {
      firebaseProjectId: 'alertbxt',
      firebaseApiKey: 'demo-api-key',
      authEmulatorUrl: 'http://localhost:9099',
      firestoreEmulatorUrl: 'http://localhost:8080',
    },
  },
});
