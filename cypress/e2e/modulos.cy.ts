// Recorrido de los módulos de la app con una sesión real contra los emuladores
// de Auth y Firestore, y las reglas de seguridad reales (firestore.rules).
// Las Cloud Functions no corren aquí: lo que dependa de ellas (p. ej. el
// conteo de votos o los push) se cubre con pruebas unitarias.

const PASSWORD = 'password123';
const COMUNIDAD = 'comunidad-e2e';

function fechaLocal(diasDesdeHoy: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + diasDesdeHoy);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

function sembrarComunidad(): void {
  cy.seedComunidad(COMUNIDAD, {
    nombreComunidad: 'Conjunto E2E',
    administradorNombre: 'Admin E2E',
    administradorCorreo: 'admin.e2e@alertbxt.test',
    administradorCelular: '3000000000',
    codigoInvitacion: 'ABCD1234',
    fechaCreacion: new Date().toISOString(),
  });
}

function sembrarUsuario(rol: 'admin' | 'propietario' | 'arrendatario' | 'guarda', nombre: string) {
  return cy.seedUsuario({
    nombre,
    correo: `${rol}@alertbxt.test`,
    password: PASSWORD,
    rol,
    torre: '10',
    numeroApartamento: '302',
  });
}

// Navega con el menú de la app (en escritorio es el lateral), no con cy.visit,
// para no recargar la app ni depender de cómo persiste la sesión.
function irA(modulo: string): void {
  cy.get(`ion-menu [data-tour="${modulo}"]`).click();
}

describe('Módulos de la app con sesión iniciada', () => {
  beforeEach(() => {
    cy.limpiarEmuladores();
    sembrarComunidad();
  });

  it('el panel de inicio saluda y muestra el pico y placa y el acceso a cada módulo', () => {
    sembrarUsuario('admin', 'Ana Admin');
    cy.iniciarSesion('admin@alertbxt.test', PASSWORD);

    cy.contains('h2.inicio-saludo', /Buen(os|as)/).should('contain.text', 'Ana');
    cy.get('[data-testid="pico-placa"]').should('be.visible');
    for (const modulo of ['inicio', 'alertas', 'notificaciones', 'encuestas', 'reservas', 'vehiculos', 'mensajes', 'perfil']) {
      cy.get(`ion-menu [data-tour="${modulo}"]`).should('exist');
    }
  });

  it('el administrador publica una encuesta y vota en ella', () => {
    sembrarUsuario('admin', 'Ana Admin');
    cy.iniciarSesion('admin@alertbxt.test', PASSWORD);
    irA('encuestas');

    cy.get('[data-testid="nueva-encuesta"]').click();
    cy.get('input[name="titulo"]').type('¿Aprobamos la nueva portería?');
    cy.get('input[placeholder="Opción 1"]').type('Sí');
    cy.get('input[placeholder="Opción 2"]').type('No');
    cy.contains('ion-button', 'Publicar').click();

    cy.contains('.enc-titulo', '¿Aprobamos la nueva portería?').should('be.visible');
    cy.contains('.enc-estado', 'Abierta').should('be.visible');

    cy.contains('.enc-radio', 'Sí').find('input').check();
    cy.contains('ion-button', 'Votar').click();
    // Tras votar desaparecen las opciones: ya no se puede votar dos veces.
    cy.get('.enc-radio').should('not.exist');
  });

  it('el administrador guarda un aviso: el botón no se bloquea y el formulario queda limpio', () => {
    sembrarUsuario('admin', 'Ana Admin');
    cy.iniciarSesion('admin@alertbxt.test', PASSWORD);
    irA('avisos');

    cy.get('ion-input[name="titulo"] input').type('Mantenimiento del ascensor');
    cy.get('ion-select[name="tipo"]').click();
    cy.get('ion-alert .alert-radio-label').contains('Informativo').click();
    cy.get('ion-alert .alert-button').last().click();
    cy.get('ion-textarea[name="descripcion"] textarea').first().type('El ascensor de la torre 10 estará fuera de servicio mañana.');
    cy.get('ion-button.guardar-aviso').should('not.have.attr', 'disabled');
    cy.get('ion-button.guardar-aviso').click();

    cy.contains('.aviso-titulo', 'Mantenimiento del ascensor').should('be.visible');
    // Tras guardar, el formulario vuelve a su estado inicial: sin errores en rojo y botón libre.
    cy.get('.aviso-form .field-error').should('not.exist');
    cy.get('ion-button.guardar-aviso').should('contain.text', 'Guardar aviso').and('have.attr', 'disabled');
  });

  it('el administrador edita una encuesta sin votos, incluidas las opciones', () => {
    sembrarUsuario('admin', 'Ana Admin');
    cy.iniciarSesion('admin@alertbxt.test', PASSWORD);
    irA('encuestas');

    cy.get('[data-testid="nueva-encuesta"]').click();
    cy.get('input[name="titulo"]').type('¿Pintamos la fachada?');
    cy.get('input[placeholder="Opción 1"]').type('Sí');
    cy.get('input[placeholder="Opción 2"]').type('No');
    cy.contains('ion-button', 'Publicar').click();
    cy.contains('.enc-titulo', '¿Pintamos la fachada?').should('be.visible');
    // Firestore muestra el documento antes de confirmar el guardado: se espera a que el formulario se cierre.
    cy.get('form.enc-form').should('not.exist');

    cy.contains('ion-button', 'Editar').click();
    cy.get('input[name="titulo"]').clear().type('¿Pintamos la fachada en diciembre?');
    cy.get('input[placeholder="Opción 2"]').clear().type('Más adelante');
    cy.contains('ion-button', 'Guardar cambios').click();

    cy.contains('.enc-titulo', '¿Pintamos la fachada en diciembre?').should('be.visible');
    cy.contains('.enc-radio', 'Más adelante').should('be.visible');
  });

  it('el administrador crea una zona y reserva un horario', () => {
    sembrarUsuario('admin', 'Ana Admin');
    cy.iniciarSesion('admin@alertbxt.test', PASSWORD);
    irA('reservas');

    cy.get('[data-testid="nueva-zona"]').click();
    cy.get('input[name="zonaNombre"]').type('Salón E2E');
    cy.contains('ion-button', 'Guardar zona').click();
    cy.contains('.res-chip', 'Salón E2E').should('be.visible');
    cy.get('.res-form').should('not.exist');

    // Editar la zona: cambia el nombre sin crear otra.
    cy.get('button[aria-label="Editar zona Salón E2E"]').click();
    cy.get('input[name="zonaNombre"]').clear().type('Salón comunal');
    cy.contains('ion-button', 'Guardar cambios').click();
    cy.contains('.res-chip', 'Salón comunal').should('be.visible');
    cy.get('.res-chip').should('have.length', 1);

    cy.get('input[name="fecha"]').type(fechaLocal(1));
    cy.get('.res-bloque--libre').first().click();
    cy.contains('ion-button', 'Confirmar reserva').click();

    cy.get('.res-bloque--mio').should('have.length', 1);
  });

  it('un propietario registra su vehículo desde su perfil', () => {
    sembrarUsuario('propietario', 'Pedro Propietario');
    cy.iniciarSesion('propietario@alertbxt.test', PASSWORD);
    irA('perfil');

    cy.get('ion-input[name="placa"] input').type('abc-123');
    cy.contains('ion-button', 'Agregar vehículo').click();
    cy.contains('.vehiculos-lista li', 'ABC123').should('be.visible');
  });

  it('el guarda consulta de quién es un vehículo', () => {
    sembrarUsuario('guarda', 'Gustavo Guarda');
    cy.seedDocumento(`vehiculos/${COMUNIDAD}_XYZ98K`, {
      placa: 'XYZ98K',
      tipo: 'moto',
      propietarioId: 'otro-vecino',
      propietarioNombre: 'Lucía Vecina',
      torre: '3',
      apartamento: '501',
      comunidadId: COMUNIDAD,
      fechaRegistro: new Date().toISOString(),
    });
    cy.iniciarSesion('guarda@alertbxt.test', PASSWORD);
    irA('vehiculos');

    cy.contains('.veh-card', 'XYZ98K').should('contain.text', 'Lucía Vecina');
    cy.get('input[name="busqueda"]').type('zzz');
    cy.get('.veh-card').should('not.exist');
    cy.get('input[name="busqueda"]').clear().type('xyz-98');
    cy.contains('.veh-card', 'XYZ98K').should('be.visible');
  });

  it('un propietario crea una notificación y la ve en su lista', () => {
    sembrarUsuario('propietario', 'Pedro Propietario');
    cy.iniciarSesion('propietario@alertbxt.test', PASSWORD);
    irA('notificaciones');

    cy.get('ion-input[name="tituloNotificacion"] input').type('Pagar la administración');
    cy.get('ion-textarea[name="descripcionNotificacion"] textarea').first().type('Antes del día cinco');
    cy.get('input[name="fechaNotificacion"]').type(fechaLocal(2));
    cy.get('input[name="horaNotificacion"]').type('09:30');
    cy.contains('ion-button', 'Guardar').click();

    cy.contains('.notificacion-item', 'Pagar la administración').should('be.visible');
  });

  describe('avisos reservados a propietarios', () => {
    function sembrarAvisos(): void {
      const base = {
        descripcionAviso: 'Detalle del aviso',
        tipoAviso: 'informativo',
        fechaPublicacion: new Date().toISOString(),
        autorId: 'admin-seed',
        autorNombre: 'Admin',
        comunidadId: COMUNIDAD,
      };
      cy.seedDocumento('avisos/a-publico', { ...base, tituloAviso: 'Corte de agua general', soloPropietarios: false });
      cy.seedDocumento('avisos/a-asamblea', { ...base, tituloAviso: 'Convocatoria de asamblea', soloPropietarios: true });
    }

    it('el arrendatario no ve las convocatorias de asamblea', () => {
      sembrarAvisos();
      sembrarUsuario('arrendatario', 'Alicia Arrendataria');
      cy.iniciarSesion('arrendatario@alertbxt.test', PASSWORD);
      irA('alertas');

      cy.contains('.card-title', 'Corte de agua general').should('be.visible');
      cy.contains('.card-title', 'Convocatoria de asamblea').should('not.exist');
    });

    it('el propietario ve todos los avisos', () => {
      sembrarAvisos();
      sembrarUsuario('propietario', 'Pedro Propietario');
      cy.iniciarSesion('propietario@alertbxt.test', PASSWORD);
      irA('alertas');

      cy.contains('.card-title', 'Corte de agua general').should('be.visible');
      cy.contains('.card-title', 'Convocatoria de asamblea').should('be.visible');
    });
  });
});
