import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AuthService } from './services/auth.service';
import { FirestoreService } from './services/firestore.service';
import { LocalNotificationService } from './services/local-notification.service';
import { PwaInstallService } from './services/pwa-install.service';

describe('AppComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          currentUser$: of(null),
          getCurrentUser: () => null,
          logout: () => of(void 0),
        },
      },
      {
        provide: FirestoreService,
        useValue: {
          addAviso: () => of('aviso-1'),
        },
      },
      {
        provide: LocalNotificationService,
        useValue: {
          notificationsEnabled$: of(false),
          start: () => undefined,
          stop: () => undefined,
          enableNotifications: () => Promise.resolve('unsupported'),
        },
      },
      {
        provide: PwaInstallService,
        useValue: {
          canInstall$: of(false),
          isIosSafari: () => false,
          install: () => Promise.resolve('unavailable'),
        },
      },
    ]
  }));

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

});
