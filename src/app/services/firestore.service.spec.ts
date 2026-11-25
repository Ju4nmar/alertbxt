import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { Functions } from '@angular/fire/functions';
import { deleteApp, FirebaseApp, initializeApp } from 'firebase/app';
import { collection, disableNetwork, doc, getDocFromCache, getDocsFromCache, getFirestore, setDoc, terminate, Timestamp } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { firstValueFrom, of } from 'rxjs';
import { Aviso, Comunidad, Usuario } from '../models';
import { AuthService } from './auth.service';
import { FirestoreService } from './firestore.service';

describe('FirestoreService', () => {
  it('impide que un usuario no administrador actualice el estado de otro usuario', async () => {
    const updateDocSpy = jasmine.createSpy('updateDoc');

    await TestBed.configureTestingModule({
      providers: [
        FirestoreService,
        { provide: Firestore, useValue: { updateDoc: updateDocSpy } },
        { provide: Functions, useValue: {} },
        {
          provide: AuthService,
          useValue: {
            getCurrentUser: () => ({
              idUsuario: 'residente-1',
              nombre: 'Residente',
              correo: 'residente@alertbxt.test',
              telefono: '3000000000',
              rol: 'residente',
              activo: true,
              comunidadId: 'comunidad-1',
            }),
          },
        },
      ],
    }).compileComponents();

    const service = TestBed.inject(FirestoreService);

    await expectAsync(firstValueFrom(service.updateUsuarioEstado('residente-2', { activo: false })))
      .toBeRejectedWithError('Solo un administrador puede actualizar el estado de usuarios');
    expect(updateDocSpy).not.toHaveBeenCalled();
  });
});

describe('FirestoreService con caché en memoria', () => {
  let app: FirebaseApp;
  let db: Firestore;
  let service: FirestoreService;
  let fetchSpy: jasmine.Spy<typeof fetch>;
  const comunidadId = 'comunidad-1';
  const fechaInicial = '2026-11-22T15:00:00.000Z';
  const fechaPosterior = '2026-11-23T15:00:00.000Z';
  const vecino: Usuario = {
    idUsuario: 'vecino-1', comunidadId, nombre: 'Ana', correo: 'ana@alertbxt.test',
    telefono: '3000000000', rol: 'arrendatario', activo: true,
  };

  beforeEach(async () => {
    fetchSpy = spyOn(window, 'fetch');
    app = initializeApp({ projectId: 'demo-alertbxt-test' }, 'alertbxt-firestore-test');
    db = getFirestore(app);
    await disableNetwork(db);
    TestBed.configureTestingModule({
      providers: [
        { provide: Firestore, useValue: db },
        { provide: Functions, useValue: getFunctions(app) },
        { provide: AuthService, useValue: { getCurrentUser: () => ({ ...vecino, idUsuario: 'admin-1', rol: 'admin' }) } },
      ],
    });
    service = TestBed.inject(FirestoreService);
  });

  afterEach(async () => {
    await terminate(db);
    await deleteApp(app);
  });

  function sembrar(ruta: string, datos: Record<string, unknown>): void {
    // Con la red deshabilitada se aplica a la caché, sin esperar el acuse del servidor.
    void setDoc(doc(db, ruta), datos);
  }

  it('actualiza perfiles por fusión, valida cambios administrativos y registra una solicitud de baja', async () => {
    sembrar('usuarios/vecino-1', { comunidadId, campoLegado: true });
    await expectAsync(firstValueFrom(service.updateUsuarioEstado('admin-1', { activo: false })))
      .toBeRejectedWithError('La actualización de usuario no es válida');
    await expectAsync(firstValueFrom(service.solicitarEliminacionCuenta('vecino-1', '')))
      .toBeRejectedWithError('No se encontró la cuenta para solicitar su eliminación');

    // Las escrituras se encolan enseguida. La consulta observa la caché sin esperar acuse remoto.
    service.addUsuario(vecino);
    service.updateUsuarioEstado('vecino-1', { activo: false, rol: 'propietario' });
    service.solicitarEliminacionCuenta('vecino-1', fechaInicial);
    const perfil = await getDocFromCache(doc(db, 'usuarios/vecino-1'));
    expect(perfil.data()).toEqual(jasmine.objectContaining({
      nombre: 'Ana', campoLegado: true, activo: false, rol: 'propietario',
      pendienteEliminacion: true, fechaSolicitudEliminacion: fechaInicial,
    }));
  });

  it('registra y actualiza un dispositivo dentro del perfil del usuario', async () => {
    await expectAsync(firstValueFrom(service.registrarDispositivo('vecino-1', { token: '', fechaRegistro: fechaInicial })))
      .toBeRejectedWithError('No se pudo registrar el dispositivo');
    sembrar('usuarios/vecino-1/dispositivos/token-1', { plataforma: 'web' });
    const dispositivo = { token: 'token-1', fechaRegistro: fechaPosterior };
    service.registrarDispositivo('vecino-1', dispositivo);
    const guardado = await getDocFromCache(doc(db, 'usuarios/vecino-1/dispositivos/token-1'));
    expect(guardado.data()).toEqual({ plataforma: 'web', ...dispositivo });
  });

  it('crea la comunidad y publica solo sus datos resumidos bajo el código de invitación', async () => {
    const comunidad: Comunidad = {
      nombreComunidad: 'El Bosque', administradorNombre: 'Ana', administradorCorreo: 'ana@alertbxt.test',
      administradorCelular: '3000000000', codigoInvitacion: 'ABCD1234', tipoComunidad: 'casas',
    };
    service.addComunidad(comunidad);
    // La colección local permite recuperar el ID generado sin esperar la confirmación de addDoc.
    const creadas = await getDocsFromCache(collection(db, 'comunidades'));
    expect(creadas.size).toBe(1);
    const id = creadas.docs[0].id;
    service.updateComunidad(id, { nombreComunidad: 'El Nogal' });
    service.registrarCodigoInvitacion(comunidad.codigoInvitacion, id, 'El Nogal', comunidad.tipoComunidad);
    const guardada = await firstValueFrom(service.getComunidadById(id));
    const resumen = await firstValueFrom(service.getComunidadByCodigoInvitacion(comunidad.codigoInvitacion));
    expect(guardada).toEqual(jasmine.objectContaining({ ...comunidad, nombreComunidad: 'El Nogal', idComunidad: id }));
    expect(resumen).toEqual({ idComunidad: id, nombreComunidad: 'El Nogal', tipoComunidad: 'casas' });
    const codigo = await getDocFromCache(doc(db, 'codigos_invitacion/ABCD1234'));
    expect(codigo.data()).toEqual({ comunidadId: id, nombreComunidad: 'El Nogal', tipoComunidad: 'casas' });
    expect(await firstValueFrom(service.getComunidadByCodigoInvitacion('NOEXISTE'))).toBeNull();
  });

  it('publica, modera y elimina un aviso SOS en la caché', async () => {
    service.addAviso({
      comunidadId, autorId: 'vecino-1', tituloAviso: 'SOS', descripcionAviso: 'Incendio',
      tipoAviso: 'alerta', estado: 'pendiente',
    });
    const [aviso] = await firstValueFrom(service.getAvisosByComunidad(comunidadId, 'arrendatario'));
    expect(aviso).toEqual(jasmine.objectContaining({ tipoAviso: 'alerta', estado: 'pendiente' }));
    service.updateAviso(aviso.idAviso!, { estado: 'validado' });
    const guardado = await getDocFromCache(doc(db, `avisos/${aviso.idAviso}`));
    expect(guardado.data()).toEqual(jasmine.objectContaining({
      estado: 'validado', soloPropietarios: false, fechaPublicacion: jasmine.any(String),
    }));
    service.deleteAviso(aviso.idAviso!);
    expect(await firstValueFrom(service.getAvisosByComunidad(comunidadId, 'arrendatario'))).toEqual([]);
  });

  it('solicita el backfill solo para avisos con identificador y sin restricción definida', async () => {
    const aviso: Aviso = { comunidadId, autorId: 'admin-1', tituloAviso: 'Asamblea', descripcionAviso: '', tipoAviso: 'informativo' };
    const actualizar = spyOn(service, 'updateAviso').and.returnValue(of(void 0));
    const actuales = [
      { ...aviso, idAviso: 'privado', soloPropietarios: true },
      { ...aviso, idAviso: 'publico', soloPropietarios: false },
      aviso,
    ];
    await firstValueFrom(service.completarSoloPropietarios(actuales));
    expect(actualizar).not.toHaveBeenCalled();
    await firstValueFrom(service.completarSoloPropietarios([...actuales, { ...aviso, idAviso: 'legado' }]));
    expect(actualizar).toHaveBeenCalledOnceWith('legado', { soloPropietarios: false });
  });

  it('crea, edita y elimina una notificación personal', async () => {
    service.addNotificacion({
      comunidadId, idUsuario: 'vecino-1', tituloNotificacion: 'Cita',
      descripcionNotificacion: 'Revisión anual', fechaHora: fechaInicial,
    });
    const [creada] = await firstValueFrom(service.getNotificacionesByComunidad(comunidadId));
    expect(creada).toEqual(jasmine.objectContaining({
      tituloNotificacion: 'Cita', fechaCreacion: jasmine.any(String), fechaHora: fechaInicial,
    }));
    service.updateNotificacion(creada.idNotificaciones!, { fechaHora: fechaPosterior });
    const [editada] = await firstValueFrom(service.getNotificacionesByUsuario('vecino-1', comunidadId));
    expect(editada.fechaHora).toBe(fechaPosterior);
    service.deleteNotificacion(creada.idNotificaciones!);
    expect(await firstValueFrom(service.getNotificacionesByComunidad(comunidadId))).toEqual([]);
  });

  it('envía la asignación grupal y comunica al usuario el rechazo devuelto por Functions', async () => {
    const datos = {
      titulo: 'Asamblea', descripcion: 'Cita de vecinos', fechaHora: fechaInicial, usuarioIds: ['vecino-1'],
    };
    fetchSpy.and.callFake(async () => new Response(JSON.stringify({ data: { notificacionId: 'aviso-1' } })));
    expect(await firstValueFrom(service.crearNotificacionAsignada(datos))).toBeUndefined();
    const [url, opciones] = fetchSpy.calls.mostRecent().args;
    expect(String(url)).toContain('/crearNotificacionAsignada');
    expect(JSON.parse(opciones?.body as string)).toEqual({ data: datos });

    spyOn(console, 'error');
    fetchSpy.and.callFake(async () => new Response(JSON.stringify({
      error: { status: 'PERMISSION_DENIED', message: 'No puedes asignar avisos fuera de tu vecindad' },
    }), { status: 403 }));
    await expectAsync(firstValueFrom(service.crearNotificacionAsignada(datos)))
      .toBeRejectedWithError('No puedes asignar avisos fuera de tu vecindad');
  });

  it('inicializa la encuesta sin votos, conserva las opciones al editar y permite cerrarla', async () => {
    service.addEncuesta({
      comunidadId, autorId: 'admin-1', titulo: 'Horario', opciones: ['Mañana', 'Tarde'],
      descripcion: 'Escoge un horario', soloPropietarios: false, cierre: fechaPosterior,
    });
    const [creada] = await firstValueFrom(service.getEncuestasByComunidad(comunidadId));
    const id = creada.idEncuesta!;
    expect(creada).toEqual(jasmine.objectContaining({ totalVotos: 0, conteo: {}, cierre: fechaPosterior }));
    expect(await firstValueFrom(service.getMiVoto(id, 'vecino-1'))).toBeNull();
    service.votarEncuesta(id, 'vecino-1', 0);
    expect(await firstValueFrom(service.getMiVoto(id, 'vecino-1'))).toBe(0);
    service.updateEncuesta(id, { titulo: 'Nuevo horario', cierre: fechaPosterior });
    const [editada] = await firstValueFrom(service.getEncuestasByComunidad(comunidadId));
    expect(editada).toEqual(jasmine.objectContaining({ titulo: 'Nuevo horario', opciones: ['Mañana', 'Tarde'] }));
    expect(editada.descripcion).toBeUndefined();
    const inicioCierre = Date.now();
    service.cerrarEncuesta(id);
    const [cerrada] = await firstValueFrom(service.getEncuestasByComunidad(comunidadId));
    expect(Date.parse(cerrada.cierre)).toBeGreaterThanOrEqual(inicioCierre);
    service.deleteEncuesta(id);
    expect(await firstValueFrom(service.getEncuestasByComunidad(comunidadId))).toEqual([]);
  });

  it('actualiza la zona sin borrar su comunidad, y registra y cancela dos bloques juntos', async () => {
    service.addZona({ comunidadId, nombre: 'Salón', descripcion: 'Eventos', horaApertura: 8, horaCierre: 20, maxHoras: 3 });
    const [zona] = await firstValueFrom(service.getZonasByComunidad(comunidadId));
    const zonaId = zona.idZona!;
    service.updateZona(zonaId, { nombre: 'Salón principal', horaApertura: 9, horaCierre: 19, maxHoras: 2 });
    const [editada] = await firstValueFrom(service.getZonasByComunidad(comunidadId));
    expect(editada).toEqual(jasmine.objectContaining({ nombre: 'Salón principal', comunidadId, maxHoras: 2 }));
    expect(editada.descripcion).toBeUndefined();

    const fecha = '2026-11-22';
    const datos = { comunidadId, zonaId, zonaNombre: editada.nombre, usuarioId: 'vecino-1', usuarioNombre: 'Ana', fecha };
    service.crearReservas([
      { ...datos, id: 'bloque-15', hora: 15, inicio: new Date(fechaInicial), torre: undefined },
      { ...datos, id: 'bloque-16', hora: 16, inicio: new Date('2026-11-22T16:00:00.000Z') },
    ]);
    const bloques = await firstValueFrom(service.getReservasDeZonaYFecha(comunidadId, zonaId, fecha));
    expect(bloques.map(item => [item.idReserva, item.hora])).toEqual([['bloque-15', 15], ['bloque-16', 16]]);
    expect(bloques[0].inicio).toBe(fechaInicial);
    service.cancelarReservas(['bloque-15', 'bloque-16']);
    expect(await firstValueFrom(service.getReservasDeZonaYFecha(comunidadId, zonaId, fecha))).toEqual([]);
    service.deleteZona(zonaId);
    expect(await firstValueFrom(service.getZonasByComunidad(comunidadId))).toEqual([]);
  });

  it('guarda el vehículo bajo el identificador comunidad-placa y omite los campos indefinidos', async () => {
    service.addVehiculo({
      comunidadId, placa: 'ABC123', tipo: 'carro', propietarioId: 'vecino-1', propietarioNombre: 'Ana',
      color: undefined,
    });
    const [vehiculo] = await firstValueFrom(service.getVehiculosDeUsuario('vecino-1', comunidadId));
    expect(vehiculo.idVehiculo).toBe('comunidad-1_ABC123');
    expect('color' in vehiculo).toBeFalse();
    service.deleteVehiculo(vehiculo.idVehiculo!);
    expect(await firstValueFrom(service.getVehiculosDeUsuario('vecino-1', comunidadId))).toEqual([]);
  });

  it('visibiliza solo avisos permitidos al arrendatario y normaliza campos antiguos', async () => {
    sembrar('avisos/antiguo', { comunidadId, soloPropietarios: false, titulo: 'Mantenimiento', fecha: fechaInicial });
    sembrar('avisos/reciente', { comunidadId, soloPropietarios: false, tituloAviso: 'Asamblea', fechaPublicacion: fechaPosterior });
    sembrar('avisos/privado', { comunidadId, soloPropietarios: true, tituloAviso: 'Propietarios', fechaPublicacion: fechaPosterior });
    sembrar('avisos/ajeno', { comunidadId: 'comunidad-2', soloPropietarios: false });
    const carga: boolean[] = [];
    const suscripcion = service.isLoading$.subscribe(estado => carga.push(estado));
    try {
      const avisos = await firstValueFrom(service.getAvisosByComunidad(comunidadId, 'arrendatario'));
      expect(avisos.map(aviso => aviso.idAviso)).toEqual(['reciente', 'antiguo']);
      expect(avisos[1]).toEqual(jasmine.objectContaining({
        tituloAviso: 'Mantenimiento', tipoAviso: 'informativo', fechaPublicacion: fechaInicial,
      }));
      expect(carga).toEqual([false, true, false]);
    } finally {
      suscripcion.unsubscribe();
    }
  });

  it('une notificaciones visibles por rol, elimina duplicados y ordena por fecha', async () => {
    sembrar('notificaciones/personal', {
      comunidadId, idUsuario: vecino.idUsuario, titulo: 'Cita', fecha: fechaPosterior,
    });
    sembrar('notificaciones/compartida', {
      comunidadId, usuariosAsignados: [vecino.idUsuario], paraTodaLaComunidad: true, fechaHora: fechaInicial,
    });
    sembrar('notificaciones/creada', { comunidadId, autorId: vecino.idUsuario, fechaHora: fechaPosterior });
    sembrar('notificaciones/ajena', { comunidadId: 'comunidad-2', idUsuario: vecino.idUsuario });

    const visibles = await firstValueFrom(service.getNotificacionesVisibles(vecino));
    expect(visibles.map(item => item.idNotificaciones)).toEqual(['compartida', 'personal']);
    expect(visibles[1]).toEqual(jasmine.objectContaining({ tituloNotificacion: 'Cita', fechaHora: fechaPosterior }));
    const admin = await firstValueFrom(service.getNotificacionesVisibles({ ...vecino, rol: 'admin' }));
    expect(admin.map(item => item.idNotificaciones)).toEqual(['compartida', 'personal', 'creada']);
  });

  it('recupera perfiles antiguos como activos y conserva los desactivados', async () => {
    sembrar('usuarios/vecino-1', { comunidadId, nombre: 'Ana' });
    sembrar('usuarios/vecino-2', { comunidadId, nombre: 'Sol', activo: false });
    sembrar('usuarios/vecino-3', { comunidadId: 'comunidad-2', nombre: 'Luz' });

    const perfil = await firstValueFrom(service.getUsuarioById('vecino-1'));
    expect(perfil).toEqual(jasmine.objectContaining({ idUsuario: 'vecino-1', activo: true }));
    const usuarios = await firstValueFrom(service.getUsuariosByComunidad(comunidadId));
    expect(usuarios.map(user => [user.nombre, user.activo])).toEqual([['Ana', true], ['Sol', false]]);
  });

  it('separa las bandejas y ordena las respuestas del hilo de la más antigua a la más reciente', async () => {
    sembrar('usuarios/vecino-1/mensajes_admin/m1', { mensaje: 'Aviso', fecha: fechaInicial });
    sembrar('usuarios/vecino-1/mensajes_admin/m2', { mensaje: 'Nueva alerta', fecha: fechaPosterior });
    sembrar('usuarios/vecino-1/mensajes_enviados/e1', { mensaje: 'Confirmado', fecha: fechaInicial });
    sembrar('usuarios/vecino-1/mensajes_admin/m1/respuestas/r2', { texto: 'Gracias', fecha: fechaPosterior });
    sembrar('usuarios/vecino-1/mensajes_admin/m1/respuestas/r1', { texto: 'Recibido', fecha: fechaInicial });
    sembrar('usuarios/vecino-1/mensajes_admin/m2/respuestas/ajena', { texto: 'Otro hilo', fecha: fechaInicial });

    const [recibidos, enviados, respuestas] = await Promise.all([
      firstValueFrom(service.getMensajesAdminByUsuario('vecino-1')),
      firstValueFrom(service.getMensajesEnviadosByUsuario('vecino-1')),
      firstValueFrom(service.getRespuestasMensaje('vecino-1', 'm1')),
    ]);
    expect(recibidos.map(item => item.idMensaje)).toEqual(['m2', 'm1']);
    expect(enviados.map(item => item.idMensaje)).toEqual(['e1']);
    expect(respuestas.map(item => item.idRespuesta)).toEqual(['r1', 'r2']);
  });

  it('limita las encuestas por rol y convierte fechas de Firestore', async () => {
    sembrar('encuestas/abierta', {
      comunidadId, soloPropietarios: false, cierre: Timestamp.fromDate(new Date(fechaPosterior)),
    });
    sembrar('encuestas/privada', { comunidadId, soloPropietarios: true, cierre: fechaInicial });
    sembrar('encuestas/ajena', { comunidadId: 'comunidad-2', soloPropietarios: false, cierre: fechaInicial });

    const abiertas = await firstValueFrom(service.getEncuestasByComunidad(comunidadId, 'arrendatario'));
    expect(abiertas.map(item => item.idEncuesta)).toEqual(['abierta']);
    expect(abiertas[0]).toEqual(jasmine.objectContaining({
      cierre: fechaPosterior, opciones: [], conteo: {}, totalVotos: 0,
    }));
    const todas = await firstValueFrom(service.getEncuestasByComunidad(comunidadId, 'admin'));
    expect(todas.map(item => item.idEncuesta)).toEqual(['abierta', 'privada']);
  });

  it('ordena vehículos por placa y filtra por comunidad y propietario', async () => {
    sembrar('vehiculos/1', { comunidadId, propietarioId: 'vecino-1', placa: 'ZZZ999' });
    sembrar('vehiculos/2', { comunidadId, propietarioId: 'vecino-1', placa: 'ABC123' });
    sembrar('vehiculos/3', { comunidadId, propietarioId: 'vecino-2', placa: 'DEF321' });
    sembrar('vehiculos/4', { comunidadId: 'comunidad-2', propietarioId: 'vecino-1', placa: 'GHI456' });

    const personales = await firstValueFrom(service.getVehiculosDeUsuario('vecino-1', comunidadId));
    const comunitarios = await firstValueFrom(service.getVehiculosDeComunidad(comunidadId));
    expect(personales.map(item => item.placa)).toEqual(['ABC123', 'ZZZ999']);
    expect(comunitarios.map(item => item.placa)).toEqual(['ABC123', 'DEF321', 'ZZZ999']);
  });

  it('distingue las reservas por zona, fecha y dueño y entrega el inicio en ISO', async () => {
    const fecha = '2026-11-22';
    sembrar('reservas/a', { comunidadId, zonaId: 'salon', fecha, usuarioId: 'vecino-1', inicio: Timestamp.fromDate(new Date(fechaInicial)) });
    sembrar('reservas/b', { comunidadId, zonaId: 'cancha', fecha, usuarioId: 'vecino-1', inicio: fechaInicial });
    sembrar('reservas/c', { comunidadId, zonaId: 'salon', fecha: '2026-11-23', usuarioId: 'vecino-2', inicio: fechaPosterior });
    sembrar('reservas/d', { comunidadId: 'comunidad-2', zonaId: 'salon', fecha, usuarioId: 'vecino-1', inicio: fechaInicial });

    const [zona, propias, comunidad] = await Promise.all([
      firstValueFrom(service.getReservasDeZonaYFecha(comunidadId, 'salon', fecha)),
      firstValueFrom(service.getReservasDeUsuario('vecino-1', comunidadId)),
      firstValueFrom(service.getReservasDeComunidad(comunidadId)),
    ]);
    expect(zona.map(item => [item.idReserva, item.inicio])).toEqual([['a', fechaInicial]]);
    expect(propias.map(item => item.idReserva)).toEqual(['a', 'b']);
    expect(comunidad.map(item => item.idReserva)).toEqual(['a', 'b', 'c']);
  });
});
