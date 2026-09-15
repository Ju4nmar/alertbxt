describe('Inicio de sesión', () => {
  beforeEach(() => {
    cy.limpiarEmuladores();
  });

  it('muestra los errores de validación cuando se envía el formulario vacío', () => {
    cy.visit('/login');

    cy.get('ion-input[name="email"] input').click().blur();
    cy.get('ion-input[name="password"] input').click().blur();

    cy.contains('El correo es requerido.').should('be.visible');
    cy.contains('La contraseña es obligatoria.').should('be.visible');
    cy.get('.confirm-btn').should('be.disabled');
  });

  it('inicia sesión con credenciales válidas y redirige al feed de alertas', () => {
    cy.seedUsuario({
      nombre: 'Vecino E2E',
      correo: 'vecino.e2e@alertbxt.test',
      password: 'password123',
      activo: true,
    });

    cy.visit('/login');
    cy.get('ion-input[name="email"] input').type('vecino.e2e@alertbxt.test');
    cy.get('ion-input[name="password"] input').type('password123');
    cy.get('.confirm-btn').click();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/alertas-eventos');
    cy.contains('h2.page-title', 'Alertas y eventos').should('be.visible');
  });

  it('muestra un error cuando la contraseña es incorrecta', () => {
    cy.seedUsuario({
      nombre: 'Vecino E2E',
      correo: 'vecino.password.e2e@alertbxt.test',
      password: 'password123',
      activo: true,
    });

    cy.visit('/login');
    cy.get('ion-input[name="email"] input').type('vecino.password.e2e@alertbxt.test');
    cy.get('ion-input[name="password"] input').type('contraseña-equivocada');
    cy.get('.confirm-btn').click();

    cy.get('.auth-error', { timeout: 10000 }).should('be.visible');
    cy.location('pathname').should('eq', '/login');
  });

  // Prueba de regresión del bug corregido en esta misma sesión: signOut()
  // fallando de forma transitoria (auth/the-service-is-currently-unavailable)
  // enmascaraba el mensaje de "cuenta desactivada" con el error crudo de
  // Firebase. Esta prueba solo puede detectar que el mensaje correcto llega
  // a la pantalla; no reproduce la falla transitoria del SDK en sí.
  it('muestra un mensaje claro cuando la cuenta está desactivada', () => {
    cy.seedUsuario({
      nombre: 'Vecino Desactivado',
      correo: 'vecino.inactivo.e2e@alertbxt.test',
      password: 'password123',
      activo: false,
    });

    cy.visit('/login');
    cy.get('ion-input[name="email"] input').type('vecino.inactivo.e2e@alertbxt.test');
    cy.get('ion-input[name="password"] input').type('password123');
    cy.get('.confirm-btn').click();

    cy.get('.auth-error', { timeout: 10000 }).should('be.visible').and('not.contain', 'auth/');
    cy.location('pathname').should('eq', '/login');
  });
});
