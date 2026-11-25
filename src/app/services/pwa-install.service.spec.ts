import { firstValueFrom } from 'rxjs';
import { PwaInstallService } from './pwa-install.service';

describe('PwaInstallService', () => {
  let service: PwaInstallService;
  let modoInstalado: boolean;
  const listeners: Array<[string, EventListenerOrEventListenerObject]> = [];

  beforeEach(() => {
    modoInstalado = false;
    spyOn(window, 'matchMedia').and.callFake(query => ({ matches: modoInstalado, media: query } as MediaQueryList));
    const escuchar = spyOn(window, 'addEventListener').and.callThrough();
    service = new PwaInstallService();
    for (const [tipo, listener] of escuchar.calls.allArgs()) {
      listeners.push([tipo, listener]);
    }
  });

  afterEach(() => {
    for (const [tipo, listener] of listeners.splice(0)) {
      window.removeEventListener(tipo, listener);
    }
  });

  function anunciar(outcome: 'accepted' | 'dismissed') {
    const prompt = jasmine.createSpy('prompt').and.resolveTo();
    const evento = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }),
    });
    window.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBeTrue();
    return prompt;
  }

  for (const outcome of ['accepted', 'dismissed'] as const) {
    it(`consume el aviso una vez cuando el usuario elige ${outcome}`, async () => {
      expect(await service.install()).toBe('unavailable');
      const prompt = anunciar(outcome);
      expect(await firstValueFrom(service.canInstall$)).toBeTrue();
      expect(await service.install()).toBe(outcome);
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(await firstValueFrom(service.canInstall$)).toBeFalse();
      expect(await firstValueFrom(service.installed$)).toBe(outcome === 'accepted');
      expect(await service.install()).toBe('unavailable');
    });
  }

  it('limpia la oferta de instalación al recibir appinstalled', async () => {
    const prompt = anunciar('accepted');
    window.dispatchEvent(new Event('appinstalled'));
    expect(await firstValueFrom(service.installed$)).toBeTrue();
    expect(await firstValueFrom(service.canInstall$)).toBeFalse();
    expect(await service.install()).toBe('unavailable');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('detecta Safari en iOS fuera del modo instalado y descarta otros navegadores', async () => {
    const agente = spyOnProperty(navigator, 'userAgent', 'get').and.returnValue('iPhone Version/18.0 Safari/605.1');
    expect(service.isIosSafari()).toBeTrue();
    modoInstalado = true;
    expect(service.isIosSafari()).toBeFalse();
    const prompt = anunciar('accepted');
    expect(await service.install()).toBe('unavailable');
    expect(prompt).not.toHaveBeenCalled();
    modoInstalado = false;
    agente.and.returnValue('iPhone CriOS/135.0 Safari/605.1');
    expect(service.isIosSafari()).toBeFalse();
  });
});
