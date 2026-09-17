describe('Unirse a una vecindad con código de invitación', () => {
  beforeEach(() => {
    cy.limpiarEmuladores();
  });

  // Regresión: getComunidadByCodigoInvitacion() se llama ANTES de que el
  // residente nuevo se autentique. Cuando esa consulta dependía de una
  // regla de Firestore que exigía sesión iniciada, esto fallaba siempre con
  // "Código de invitación inválido" — el bug reportado por el usuario, ya
  // fuera llenando el formulario o entrando con Google. Esta prueba corre
  // sin ninguna sesión previa, igual que un residente real.
  it('permite registrarse como residente nuevo con un código de invitación válido, sin sesión previa', () => {
    cy.seedComunidad('comunidad-e2e', {
      nombreComunidad: 'Cañadulce E2E',
      administradorNombre: 'Admin Seed',
      administradorCorreo: 'admin.seed.e2e@alertbxt.test',
      administradorCelular: '3000000000',
      codigoInvitacion: 'ABCD1234',
      fechaCreacion: new Date().toISOString(),
    });
    cy.registrarCodigoInvitacion('ABCD1234', 'comunidad-e2e', 'Cañadulce E2E');

    cy.visit('/unirse-vecindad?codigo=ABCD1234');

    cy.get('ion-input[name="nombre"] input').type('Residente Nuevo');
    cy.get('ion-input[name="correo"] input').type('residente.nuevo.e2e@alertbxt.test');
    cy.get('ion-input[name="telefono"] input').type('3000000000');
    cy.get('ion-input[name="numeroApartamento"] input').type('101');
    cy.get('ion-input[name="password"] input').type('password123');
    cy.get('ion-input[name="confirmPassword"] input').type('password123');
    cy.get('ion-checkbox[name="aceptaTerminos"]').click();
    cy.get('.confirm-btn').click();

    cy.location('pathname', { timeout: 10000 }).should('eq', '/alertas-eventos');
  });

  it('muestra un error claro cuando el código de invitación no existe', () => {
    cy.visit('/unirse-vecindad?codigo=NOEXISTE');

    cy.get('ion-input[name="nombre"] input').type('Residente');
    cy.get('ion-input[name="correo"] input').type('otro.residente.e2e@alertbxt.test');
    cy.get('ion-input[name="telefono"] input').type('3000000000');
    cy.get('ion-input[name="numeroApartamento"] input').type('101');
    cy.get('ion-input[name="password"] input').type('password123');
    cy.get('ion-input[name="confirmPassword"] input').type('password123');
    cy.get('ion-checkbox[name="aceptaTerminos"]').click();
    cy.get('.confirm-btn').click();

    cy.get('.error-message', { timeout: 10000 }).should('contain', 'código de invitación no es válido');
    cy.location('pathname').should('eq', '/unirse-vecindad');
  });
});
