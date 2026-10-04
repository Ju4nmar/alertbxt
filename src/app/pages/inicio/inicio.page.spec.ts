import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Aviso, Recordatorio, Usuario } from '../../models';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { InicioPage } from './inicio.page';

const ahora = Date.now();
const hace = (horas: number) => new Date(ahora - horas * 3600_000).toISOString();
const en = (horas: number) => new Date(ahora + horas * 3600_000).toISOString();

const usuario: Usuario = {
  idUsuario: 'u1', nombre: 'Ana María', correo: 'a@a.com', telefono: '300',
  rol: 'admin', activo: true, comunidadId: 'c1',
};

const avisos: Aviso[] = [
  { idAviso: '1', tituloAviso: 'SOS reciente', descripcionAviso: '', tipoAviso: 'alerta', fechaPublicacion: hace(1), autorId: 'x', comunidadId: 'c1' },
  { idAviso: '2', tituloAviso: 'SOS rechazada', descripcionAviso: '', tipoAviso: 'alerta', estado: 'rechazado', fechaPublicacion: hace(1), autorId: 'x', comunidadId: 'c1' },
  { idAviso: '3', tituloAviso: 'SOS vieja', descripcionAviso: '', tipoAviso: 'alerta', fechaPublicacion: hace(48), autorId: 'x', comunidadId: 'c1' },
  { idAviso: '4', tituloAviso: 'Asamblea', descripcionAviso: '', tipoAviso: 'informativo', fechaPublicacion: hace(5), autorId: 'x', comunidadId: 'c1' },
];

const recordatorios: Recordatorio[] = [
  { idRecordatorios: 'r1', tituloRecordatorio: 'Pasada', descripcionRecordatorio: '', fechaHora: hace(2), comunidadId: 'c1' },
  { idRecordatorios: 'r2', tituloRecordatorio: 'Mañana', descripcionRecordatorio: '', fechaHora: en(24), comunidadId: 'c1' },
  { idRecordatorios: 'r3', tituloRecordatorio: 'Hecha', descripcionRecordatorio: '', fechaHora: en(3), estado: 'completado', comunidadId: 'c1' },
];

describe('InicioPage', () => {
  let fixture: ComponentFixture<InicioPage>;
  let component: InicioPage;
  const updateComunidad = jasmine.createSpy('updateComunidad').and.returnValue(of(void 0));

  beforeEach(async () => {
    updateComunidad.calls.reset();
    await TestBed.configureTestingModule({
      imports: [InicioPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser$: of(usuario) } },
        {
          provide: FirestoreService,
          useValue: {
            getAvisosByComunidad: () => of(avisos),
            getRecordatoriosVisibles: () => of(recordatorios),
            getComunidadById: () => of({ idComunidad: 'c1', nombreComunidad: 'Torres del Sol', picoPlaca: { lunes: '1 y 2' } }),
            updateComunidad,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InicioPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('cuenta solo las alertas de las últimas 24 horas que no fueron rechazadas', () => {
    expect(component.alertasActivas).toBe(1);
  });

  it('lista noticias sin alertas y notificaciones futuras pendientes', () => {
    expect(component.noticias.map(a => a.idAviso)).toEqual(['4']);
    expect(component.proximas.map(r => r.idRecordatorios)).toEqual(['r2']);
  });

  it('saluda con el primer nombre', () => {
    expect(component.saludo).toContain('Ana');
  });

  it('el administrador guarda el pico y placa recortado', async () => {
    component.editarPicoPlaca();
    expect(component.borradorPicoPlaca['lunes']).toBe('1 y 2');
    component.borradorPicoPlaca['martes'] = '  3 y 4  ';

    await component.guardarPicoPlaca();

    expect(updateComunidad).toHaveBeenCalledWith('c1', jasmine.objectContaining({
      picoPlaca: jasmine.objectContaining({ lunes: '1 y 2', martes: '3 y 4' }),
    }));
    expect(component.editandoPicoPlaca).toBeFalse();
  });
});
