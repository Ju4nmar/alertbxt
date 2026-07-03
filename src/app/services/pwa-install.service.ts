import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Injectable({
  providedIn: 'root',
})
export class PwaInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private readonly canInstallSubject = new BehaviorSubject<boolean>(false);
  private readonly installedSubject = new BehaviorSubject<boolean>(this.isStandalone());

  readonly canInstall$ = this.canInstallSubject.asObservable();
  readonly installed$ = this.installedSubject.asObservable();

  constructor() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstallSubject.next(!this.isStandalone());
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstallSubject.next(false);
      this.installedSubject.next(true);
    });
  }

  async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPrompt || this.isStandalone()) {
      return 'unavailable';
    }

    await this.deferredPrompt.prompt();
    const choice = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstallSubject.next(false);

    if (choice.outcome === 'accepted') {
      this.installedSubject.next(true);
    }

    return choice.outcome;
  }

  isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches
      || ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  }

  isIosSafari(): boolean {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/crios|fxios|edgios/.test(userAgent);
    return isIos && isSafari && !this.isStandalone();
  }
}
