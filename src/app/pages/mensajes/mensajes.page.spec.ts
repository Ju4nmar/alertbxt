import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MensajeAdmin, Usuario } from '../../models';
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser$: of(null) } },
        { provide: MensajesService, useValue: { getRespuestas: () => of([]) } },
        { provide: ToastService, useValue: {} },
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
