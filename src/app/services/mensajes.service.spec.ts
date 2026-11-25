import { TestBed } from '@angular/core/testing';
import { Functions } from '@angular/fire/functions';
import { deleteApp, FirebaseApp, initializeApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';
import { firstValueFrom, of } from 'rxjs';
import { FirestoreService } from './firestore.service';
import { MensajesService } from './mensajes.service';

describe('MensajesService', () => {
  let app: FirebaseApp;
  let service: MensajesService;
  let db: jasmine.SpyObj<FirestoreService>;
  let fetchSpy: jasmine.Spy<typeof fetch>;

  beforeEach(() => {
    fetchSpy = spyOn(window, 'fetch');
    app = initializeApp({ projectId: 'demo-alertbxt-mensajes' }, 'alertbxt-mensajes-spec');
    db = jasmine.createSpyObj<FirestoreService>('FirestoreService', [
      'getMensajesAdminByUsuario', 'getMensajesEnviadosByUsuario', 'getRespuestasMensaje',
    ]);
    TestBed.configureTestingModule({
      providers: [
        { provide: Functions, useValue: getFunctions(app) },
        { provide: FirestoreService, useValue: db },
      ],
    });
    service = TestBed.inject(MensajesService);
  });

  afterEach(() => deleteApp(app));

  it('envía el mensaje y su respuesta a las funciones respectivas con el payload correcto', async () => {
    fetchSpy.and.callFake(async () => new Response(JSON.stringify({ data: { mensajeId: 'm1', enviados: 2 } })));
    expect(await firstValueFrom(service.enviarMensajeIndividual(['vecino-1', 'vecino-2'], 'Asamblea'))).toBeUndefined();
    expect(await firstValueFrom(service.responderMensaje('m1', 'Confirmado'))).toBeUndefined();
    const [enviar, responder] = fetchSpy.calls.allArgs();
    expect(String(enviar[0])).toContain('/enviarMensajeIndividual');
    expect(JSON.parse(enviar[1]?.body as string)).toEqual({ data: { destinatarioIds: ['vecino-1', 'vecino-2'], mensaje: 'Asamblea' } });
    expect(String(responder[0])).toContain('/responderMensajeAdmin');
    expect(JSON.parse(responder[1]?.body as string)).toEqual({ data: { mensajeId: 'm1', texto: 'Confirmado' } });
  });

  it('propaga los mensajes de error de Functions al enviar y responder', async () => {
    spyOn(console, 'error');
    fetchSpy.and.callFake(async () => new Response(JSON.stringify({
      error: { status: 'PERMISSION_DENIED', message: 'No puedes enviar a otra comunidad' },
    }), { status: 403 }));
    await expectAsync(firstValueFrom(service.enviarMensajeIndividual(['ajeno'], 'Asamblea')))
      .toBeRejectedWithError('No puedes enviar a otra comunidad');
    await expectAsync(firstValueFrom(service.responderMensaje('m1', 'Confirmado')))
      .toBeRejectedWithError('No puedes enviar a otra comunidad');
  });

  it('consulta la bandeja, los enviados y las respuestas con sus identificadores', () => {
    const recibidos = of([]);
    const enviados = of([]);
    const respuestas = of([]);
    db.getMensajesAdminByUsuario.and.returnValue(recibidos);
    db.getMensajesEnviadosByUsuario.and.returnValue(enviados);
    db.getRespuestasMensaje.and.returnValue(respuestas);
    expect(service.getMensajesByUsuario('vecino-1')).toBe(recibidos);
    expect(service.getMensajesEnviados('admin-1')).toBe(enviados);
    expect(service.getRespuestas('vecino-1', 'm1')).toBe(respuestas);
    expect(db.getMensajesAdminByUsuario).toHaveBeenCalledOnceWith('vecino-1');
    expect(db.getMensajesEnviadosByUsuario).toHaveBeenCalledOnceWith('admin-1');
    expect(db.getRespuestasMensaje).toHaveBeenCalledOnceWith('vecino-1', 'm1');
  });
});
