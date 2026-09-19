import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { MensajesService } from '../../services/mensajes.service';
import { ToastService } from '../../services/toast.service';
import { MensajesPage } from './mensajes.page';

describe('MensajesPage (mensajes largos)', () => {
  let page: MensajesPage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser$: of(null) } },
        { provide: MensajesService, useValue: {} },
        { provide: ToastService, useValue: {} },
      ],
    });
    page = TestBed.runInInjectionContext(() => new MensajesPage());
  });

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
