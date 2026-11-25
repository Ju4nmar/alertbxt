import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { MensajeAdmin, MensajeEnviado, RespuestaMensaje, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { MensajesService } from '../../services/mensajes.service';
import { ToastService } from '../../services/toast.service';
import { MensajesPage } from './mensajes.page';

const adminRemitente: Usuario = {
  idUsuario: 'admin-1',
  nombre: 'Juan Hernandes',
  correo: 'juan@alertbxt.test',
  telefono: '3000000000',
  torre: '4',
  numeroApartamento: '304',
  rol: 'admin',
  activo: true,
  comunidadId: 'com-1',
};

describe('MensajesPage', () => {
  let page: MensajesPage;
  let sesion: BehaviorSubject<Usuario | null>;
  let servicio: jasmine.SpyObj<MensajesService>;
  let toast: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    sesion = new BehaviorSubject<Usuario | null>(null);
    servicio = jasmine.createSpyObj<MensajesService>('MensajesService', [
      'getRespuestas', 'getMensajesByUsuario', 'getMensajesEnviados', 'responderMensaje',
    ]);
    servicio.getRespuestas.and.returnValue(of([]));
    servicio.getMensajesByUsuario.and.returnValue(of([]));
    servicio.getMensajesEnviados.and.returnValue(of([]));
    toast = jasmine.createSpyObj<ToastService>('ToastService', ['error']);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser$: sesion } },
        { provide: MensajesService, useValue: servicio },
        { provide: ToastService, useValue: toast },
        {
          provide: FirestoreService,
          useValue: {
            getUsuarioById: () => of(adminRemitente),
            getComunidadById: () => of({ tipoComunidad: 'apartamentos' }),
          },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new MensajesPage());
    page.usuario = { ...adminRemitente, idUsuario: 'admin-2', nombre: 'Otro Admin' };
  });

  afterEach(() => page.ngOnDestroy());

  describe('mensajes largos', () => {
    it('no recorta los mensajes cortos', () => {
      expect(page.esTextoLargo('Hola vecino')).toBeFalse();
      expect(page.esTextoLargo(undefined)).toBeFalse();
    });

    it('recorta los mensajes con muchos caracteres o muchas líneas', () => {
      expect(page.esTextoLargo('a'.repeat(300))).toBeTrue();
      expect(page.esTextoLargo('1\n2\n3\n4\n5\n6')).toBeTrue();
    });

    it('alterna entre expandido y recogido', () => {
      expect(page.textoExpandido('r-1')).toBeFalse();
      page.alternarTexto('r-1');
      expect(page.textoExpandido('r-1')).toBeTrue();
      page.alternarTexto('r-1');
      expect(page.textoExpandido('r-1')).toBeFalse();
    });
  });

  describe('bandeja de recibidos', () => {
    const mensajeDeAdmin: MensajeAdmin = {
      idMensaje: 'm-1',
      autorId: 'admin-1',
      autorNombre: 'Juan Hernandes',
      mensaje: 'Hola',
      fecha: '2026-09-19T15:00:00.000Z',
    };

    const enviado: MensajeEnviado = {
      idMensaje: 'enviado-1',
      mensaje: mensajeDeAdmin.mensaje,
      fecha: mensajeDeAdmin.fecha,
      destinatarios: [
        { id: 'vecino-1', nombre: 'Ana', mensajeId: 'copia-1' },
        { id: 'vecino-2', nombre: 'Luis', mensajeId: 'copia-2' },
        { id: 'vecino-3', nombre: 'Eva', mensajeId: 'copia-3' },
      ],
    };

    it('carga recibidos para residentes y enviados al iniciar sesión como administrador', () => {
      servicio.getMensajesByUsuario.and.returnValue(of([mensajeDeAdmin]));
      servicio.getMensajesEnviados.and.returnValue(of([enviado]));
      page.ngOnInit();
      expect(servicio.getMensajesByUsuario).not.toHaveBeenCalled();
      sesion.next({ ...adminRemitente, idUsuario: 'vecino-1', rol: 'residente' });
      expect(page.mensajesRecibidos).toEqual([mensajeDeAdmin]);
      expect(page.isLoading).toBeFalse();
      expect(servicio.getMensajesEnviados).not.toHaveBeenCalled();

      sesion.next(adminRemitente);
      expect(servicio.getMensajesEnviados).toHaveBeenCalledOnceWith('admin-1');
      expect(page.mensajesEnviados).toEqual([enviado]);
    });

    it('abre el hilo del destinatario seleccionado y cierra el detalle al cambiar de bandeja', () => {
      const respuestas = new Subject<RespuestaMensaje[]>();
      servicio.getRespuestas.withArgs('vecino-2', 'copia-2').and.returnValue(respuestas);
      page.seleccionarEnviado(enviado);
      expect(page.esEnviadoSeleccionado(enviado)).toBeTrue();
      expect(page.formatearDestinatarios(enviado)).toBe('Ana, Luis y 1 más');
      expect(page.hiloEstaAbierto('vecino-1', 'copia-1')).toBeTrue();

      page.toggleHilo('vecino-2', 'copia-2');
      expect(page.cargandoRespuestas).toBeTrue();
      const respuesta: RespuestaMensaje = {
        autorId: 'vecino-2', autorNombre: 'Luis', texto: 'Recibido',
        fecha: mensajeDeAdmin.fecha, esAdmin: false,
      };
      respuestas.next([respuesta]);
      expect(page.respuestasDe('vecino-2', 'copia-2')).toEqual([respuesta]);
      expect(page.cargandoRespuestas).toBeFalse();

      page.toggleHilo('vecino-2', 'copia-2');
      expect(respuestas.observed).toBeFalse();
      page.cambiarVista('recibidos');
      expect(page.hayDetalleAbierto).toBeFalse();
      expect(page.hiloAbierto).toBeNull();
    });

    it('recorta la respuesta y evita un segundo envío mientras se procesa el primero', () => {
      spyOn(console, 'error');
      const envio = new Subject<never>();
      servicio.responderMensaje.and.returnValue(envio);
      page.textoRespuesta = '  Confirmado  ';
      page.enviarRespuesta(mensajeDeAdmin);
      page.enviarRespuesta(mensajeDeAdmin);

      expect(servicio.responderMensaje).toHaveBeenCalledOnceWith('m-1', 'Confirmado');
      expect(page.enviandoRespuesta).toBeTrue();
      envio.error(new Error('Sin conexión'));
      expect(toast.error).toHaveBeenCalledOnceWith('Sin conexión');
      expect(page.enviandoRespuesta).toBeFalse();
      expect(page.textoRespuesta).toBe('  Confirmado  ');
    });

    it('limpia el borrador después de enviar una respuesta', () => {
      servicio.responderMensaje.and.returnValue(of(void 0));
      page.textoRespuesta = ' ';
      page.enviarRespuesta(mensajeDeAdmin);
      expect(servicio.responderMensaje).not.toHaveBeenCalled();

      page.textoRespuesta = 'Confirmado';
      page.enviarRespuesta(mensajeDeAdmin);
      expect(page.textoRespuesta).toBe('');
      expect(page.enviandoRespuesta).toBeFalse();
    });

    it('muestra un error de carga si falla la consulta de recibidos', () => {
      spyOn(console, 'error');
      servicio.getMensajesByUsuario.and.returnValue(throwError(() => new Error('Sin conexión')));
      page.ngOnInit();
      sesion.next(adminRemitente);
      expect(page.isLoading).toBeFalse();
      expect(page.cargaError).toContain('No se pudieron cargar los mensajes');
    });

    it('muestra el rol y la unidad de quien envía el mensaje', () => {
      expect(page.contextoDe('admin-1')).toBe('');

      page.seleccionarRecibido(mensajeDeAdmin);

      expect(page.contextoDe('admin-1')).toBe('Administrador · Torre 4 - Apto 304');
    });

    it('un administrador también puede abrir el hilo para responder un mensaje de otro administrador', () => {
      page.seleccionarRecibido(mensajeDeAdmin);

      expect(page.mensajeRecibidoSeleccionado).toBe(mensajeDeAdmin);
      expect(page.hiloEstaAbierto('admin-2', 'm-1')).toBeTrue();
    });

    it('una respuesta que llega a la bandeja se lee sin abrir hilo', () => {
      const respuesta: MensajeAdmin = { ...mensajeDeAdmin, idMensaje: 'm-2', esRespuesta: true, enRespuestaA: 'm-1' };

      page.seleccionarRecibido(respuesta);

      expect(page.mensajeRecibidoSeleccionado).toBe(respuesta);
      expect(page.hiloAbierto).toBeNull();
    });
  });
});
