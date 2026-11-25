import { AlertController } from '@ionic/angular/standalone';
import { Aviso, Usuario } from '../../models';
import { ToastService } from '../../services/toast.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Storage } from '@angular/fire/storage';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ImageOptimizerService } from '../../services/image-optimizer.service';
import { LocalNotificationService } from '../../services/local-notification.service';
import { GestionAvisosPage } from './gestion-avisos.page';

describe('GestionAvisosPage', () => {
  let component: GestionAvisosPage;
  let fixture: ComponentFixture<GestionAvisosPage>;

  const admin: Usuario = {
    idUsuario: 'admin-1', nombre: 'Admin', comunidadId: 'comunidad-1',
    activo: true, correo: '', telefono: '', rol: 'admin',
  };
  const aviso: Aviso = {
    idAviso: 'aviso-1', tituloAviso: 'Mantenimiento',
    descripcionAviso: 'Mantenimiento programado', tipoAviso: 'mantenimiento',
    fechaPublicacion: '2026-09-10T09:00:00.000Z', autorId: 'admin-1',
    comunidadId: 'comunidad-1', soloPropietarios: true,
  };
  const sos: Aviso = { ...aviso, idAviso: 'sos-1', tipoAviso: 'alerta' };
  let auth: AuthService;
  let firestore: FirestoreService;
  let toast: ToastService;
  let confirmar: (() => Promise<void>) | undefined;
  let presentar: jasmine.Spy;

  beforeEach(async () => {
    confirmar = undefined;
    presentar = jasmine.createSpy('present').and.resolveTo();
    await TestBed.configureTestingModule({
      imports: [GestionAvisosPage],
      providers: [
        { provide: Storage, useValue: {} },
        { provide: ToastService, useValue: { success: jasmine.createSpy().and.resolveTo(), error: jasmine.createSpy().and.resolveTo() } },
        {
          provide: AlertController,
          useValue: {
            create: async (options: { buttons: { role: string; handler?: () => Promise<void> }[] }) => {
              confirmar = options.buttons.find(button => button.role === 'destructive')?.handler;
              return { present: presentar };
            },
          },
        },
        {
          provide: AuthService,
          useValue: {
            currentUser$: of(admin),
            getCurrentUser: () => admin,
          },
        },
        {
          provide: FirestoreService,
          useValue: {
            isLoading$: of(false),
            getAvisosByComunidad: () => of([]),
            completarSoloPropietarios: () => of([]),
            addAviso: () => of('aviso-1'),
            updateAviso: () => of(void 0),
            deleteAviso: () => of(void 0),
          },
        },
        {
          provide: ImageOptimizerService,
          useValue: {
            optimize: (file: File) => Promise.resolve({
              file,
              originalSize: file.size,
              optimizedSize: file.size,
              convertedToWebp: false,
            }),
          },
        },
        {
          provide: LocalNotificationService,
          useValue: {
            showNotification: () => undefined,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GestionAvisosPage);
    component = fixture.componentInstance;
    auth = TestBed.inject(AuthService);
    firestore = TestBed.inject(FirestoreService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('separa las alertas SOS para moderación y evita editarlas', () => {
    const alertaSos = {
      idAviso: 'sos-1',
      tituloAviso: 'Alerta SOS',
      descripcionAviso: 'Necesito ayuda',
      tipoAviso: 'alerta',
      fechaPublicacion: '2026-09-10T10:00:00.000Z',
      autorId: 'residente-1',
      comunidadId: 'comunidad-1',
    };
    const avisoAdministrativo = {
      idAviso: 'aviso-1',
      tituloAviso: 'Mantenimiento',
      descripcionAviso: 'Mantenimiento programado',
      tipoAviso: 'mantenimiento',
      fechaPublicacion: '2026-09-10T09:00:00.000Z',
      autorId: 'admin-1',
      comunidadId: 'comunidad-1',
    };
    const alertaSosAnterior = {
      ...alertaSos,
      idAviso: 'sos-0',
      fechaPublicacion: '2026-09-10T08:00:00.000Z',
    };

    component.organizarAvisos([alertaSosAnterior, avisoAdministrativo, alertaSos]);
    component.editarAviso(alertaSos);

    expect(component.avisosAdministrativos).toEqual([avisoAdministrativo]);
    expect(component.alertasSos).toEqual([alertaSos, alertaSosAnterior]);
    expect(component.idEditando).toBeNull();
    expect(component.avisoError).toContain('no se pueden editar');
  });

  describe('formulario de avisos', () => {
    function llenarFormulario(): void {
      component.titulo = '  Mantenimiento  ';
      component.tipo = 'mantenimiento';
      component.descripcion = 'Mantenimiento programado';
      component.fechaAviso = '2026-09-10';
    }

    it('publica un aviso y limpia el formulario', async () => {
      const agregar = spyOn(firestore, 'addAviso').and.returnValue(of('aviso-1'));
      llenarFormulario();
      component.ubicacion = '  Entrada  ';

      await component.guardarAviso();

      expect(agregar).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        tituloAviso: 'Mantenimiento', ubicacionAviso: 'Entrada',
        comunidadId: 'comunidad-1', autorId: 'admin-1', soloPropietarios: false,
      }));
      expect(component.titulo).toBe('');
      expect(component.isLoading).toBeFalse();
      expect(toast.success).toHaveBeenCalledWith('Aviso publicado');
    });

    it('actualiza el mismo aviso al quitar la restricción para propietarios', async () => {
      const actualizar = spyOn(firestore, 'updateAviso').and.returnValue(of(void 0));
      component.editarAviso({ ...aviso, imagen: 'https://example.invalid/aviso.webp' });
      expect(component.soloPropietarios).toBeTrue();
      component.soloPropietarios = false;

      await component.guardarAviso();

      expect(actualizar).toHaveBeenCalledOnceWith('aviso-1', jasmine.objectContaining({
        soloPropietarios: false, imagen: 'https://example.invalid/aviso.webp',
      }));
      expect(component.idEditando).toBeNull();
      expect(toast.success).toHaveBeenCalledWith('Aviso actualizado');
    });

    for (const caso of [
      { campo: 'titulo', valor: '', mensaje: 'Completa' },
      { campo: 'tipo', valor: 'alerta', mensaje: 'tipo de aviso' },
      { campo: 'descripcion', valor: 'Corta', mensaje: 'longitud' },
      { campo: 'fechaAviso', valor: 'fecha inválida', mensaje: 'fecha válida' },
    ] as const) {
      it(`impide guardar cuando falla la validación de ${caso.campo}`, async () => {
        const agregar = spyOn(firestore, 'addAviso');
        llenarFormulario();
        component[caso.campo] = caso.valor;

        await component.guardarAviso();

        expect(component.avisoError).toContain(caso.mensaje);
        expect(agregar).not.toHaveBeenCalled();
      });
    }

    it('impide guardar a un residente', async () => {
      spyOn(auth, 'getCurrentUser').and.returnValue({ ...admin, rol: 'propietario' });
      const agregar = spyOn(firestore, 'addAviso');
      llenarFormulario();

      await component.guardarAviso();

      expect(component.avisoError).toContain('permisos');
      expect(agregar).not.toHaveBeenCalled();
    });

    it('conserva los datos y desbloquea el formulario si falla el guardado', async () => {
      spyOn(console, 'error');
      spyOn(firestore, 'addAviso').and.returnValue(throwError(() => new Error('sin conexión')));
      llenarFormulario();

      await component.guardarAviso();

      expect(component.avisoError).toContain('No se pudo guardar');
      expect(component.titulo.trim()).toBe('Mantenimiento');
      expect(component.isLoading).toBeFalse();
    });
  });

  it('valida una SOS y envía al historial las rechazadas', async () => {
    const actualizar = spyOn(firestore, 'updateAviso').and.returnValue(of(void 0));

    await component.validarAlertaSos(sos);
    await component.rechazarAlertaSos(sos);
    const rechazada: Aviso = { ...sos, estado: 'rechazado' };
    component.organizarAvisos([aviso, rechazada]);

    expect(actualizar.calls.allArgs()).toEqual([
      ['sos-1', { estado: 'validado' }], ['sos-1', { estado: 'rechazado' }],
    ]);
    expect(component.alertasSos).toEqual([]);
    expect(component.historialAlertasSos).toEqual([rechazada]);
  });

  it('muestra un error si falla la moderación de una SOS', async () => {
    spyOn(console, 'error');
    spyOn(firestore, 'updateAviso').and.returnValue(throwError(() => new Error('sin conexión')));

    await component.rechazarAlertaSos(sos);

    expect(component.avisoError).toContain('No se pudo actualizar');
    expect(toast.error).toHaveBeenCalled();
  });

  it('elimina un aviso y una SOS solo después de su confirmación', async () => {
    const eliminar = spyOn(firestore, 'deleteAviso').and.returnValue(of(void 0));

    await component.eliminarAviso(aviso.idAviso);
    expect(presentar).toHaveBeenCalled();
    expect(eliminar).not.toHaveBeenCalled();
    expect(confirmar).toBeDefined();
    await confirmar!();
    await Promise.resolve();

    await component.eliminarAlertaSos(sos);
    expect(eliminar.calls.count()).toBe(1);
    expect(confirmar).toBeDefined();
    await confirmar!();

    expect(eliminar.calls.allArgs()).toEqual([['aviso-1'], ['sos-1']]);
  });

  it('permite cerrar la confirmación de aviso o SOS sin esperar la escritura ni repetirla', async () => {
    spyOn(console, 'error');
    const escritura = new Subject<void>();
    const eliminar = spyOn(firestore, 'deleteAviso').and.returnValues(escritura, of(void 0));
    await component.eliminarAviso(aviso.idAviso);
    expect(confirmar!()).toBeUndefined();
    confirmar!();
    await component.eliminarAlertaSos(sos);
    expect(eliminar).toHaveBeenCalledOnceWith('aviso-1');
    expect(component.eliminandoAviso).toBeTrue();
    expect(toast.success).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.lists-col [role="status"]')?.textContent).toContain('Eliminando');

    escritura.error(new Error('Sin conexión'));
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.lists-col [role="alert"]')?.textContent)
      .toContain('No se pudo eliminar el aviso.');
    await component.eliminarAlertaSos(sos);
    expect(confirmar!()).toBeUndefined();
    expect(eliminar.calls.allArgs()).toEqual([['aviso-1'], ['sos-1']]);
  });
});
