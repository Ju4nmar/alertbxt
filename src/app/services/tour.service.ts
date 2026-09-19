import { Injectable } from '@angular/core';
import Shepherd from 'shepherd.js';
import { environment } from '../../environments/environment';
import { Usuario } from '../models';

interface PasoTour {
  id: string;
  titulo: string;
  texto: string;
  soloAdmin?: boolean;
}

const PASOS: PasoTour[] = [
  { id: 'alertas', titulo: 'Alertas y eventos', texto: 'Aquí ves los avisos de tu comunidad, las alertas SOS y tus recordatorios próximos.' },
  { id: 'avisos', titulo: 'Gestión de avisos', texto: 'Publica avisos para toda la comunidad y modera las alertas SOS.', soloAdmin: true },
  { id: 'recordatorios', titulo: 'Recordatorios', texto: 'Crea recordatorios con fecha y hora; te avisaremos cuando lleguen.' },
  { id: 'vecinos', titulo: 'Gestión de vecinos', texto: 'Consulta a tus vecinos, activa o desactiva cuentas y envíales mensajes.', soloAdmin: true },
  { id: 'estadisticas', titulo: 'Estadísticas', texto: 'Un resumen visual de vecinos, avisos y recordatorios.', soloAdmin: true },
  { id: 'mensajes', titulo: 'Mensajes', texto: 'Lee los mensajes del administrador y respóndelos desde aquí.' },
  { id: 'perfil', titulo: 'Perfil', texto: 'Actualiza tus datos y consulta el código de invitación de tu vecindad.' },
  { id: 'guia', titulo: 'Guía de uso', texto: 'Si tienes dudas, aquí encuentras una explicación de cada función. Desde ahí también puedes volver a ver este recorrido.' },
  { id: 'sos', titulo: 'Botón SOS', texto: 'En una emergencia, mantén presionado este botón hasta completar el anillo para enviar una alerta a tu comunidad.' },
];

@Injectable({ providedIn: 'root' })
export class TourService {
  private tour: InstanceType<typeof Shepherd.Tour> | null = null;
  private iniciando = false;

  yaVisto(uid: string): boolean {
    try {
      return !!localStorage.getItem(this.clave(uid));
    } catch {
      // Sin localStorage no se puede recordar: mejor no mostrarlo en cada
      // arranque que molestar al usuario una y otra vez.
      return true;
    }
  }

  // Solo lanza el recorrido la primera vez que un vecino ya pertenece a una
  // comunidad (no interrumpe "Unirme a una vecindad"). No se dispara contra
  // los emuladores de e2e: el overlay taparía los clics de Cypress.
  iniciarSiEsNuevo(user: Usuario | null): void {
    if (environment.useEmulators || !user?.idUsuario || !user.comunidadId || this.yaVisto(user.idUsuario)) {
      return;
    }

    // Deja terminar el splash antes de buscar elementos.
    window.setTimeout(() => this.iniciar(user), 1200);
  }

  iniciar(user: Usuario | null): void {
    if (!user?.idUsuario || this.iniciando || this.tour?.isActive()) {
      return;
    }

    // El menú lateral/inferior se acomoda de forma asíncrona tras el login:
    // se espera a que haya navegación visible en vez de asumir un retraso fijo.
    this.iniciando = true;
    void this.esperarNavegacion().then(() => {
      this.iniciando = false;
      this.construirYComenzar(user);
    });
  }

  private async esperarNavegacion(): Promise<void> {
    for (let intento = 0; intento < 16 && !this.buscarVisible('alertas'); intento++) {
      await new Promise(resolve => window.setTimeout(resolve, 250));
    }
  }

  private construirYComenzar(user: Usuario): void {
    if (!user.idUsuario) {
      return;
    }

    const uid = user.idUsuario;
    const esAdmin = user.rol === 'admin';
    const tour = new Shepherd.Tour({
      useModalOverlay: true,
      exitOnEsc: true,
      keyboardNavigation: true,
      defaultStepOptions: {
        cancelIcon: { enabled: false },
        scrollTo: { behavior: 'smooth', block: 'center' },
        modalOverlayOpeningPadding: 6,
        modalOverlayOpeningRadius: 10,
        classes: 'ab-tour-step',
      },
    });

    const pasos = PASOS
      .filter(paso => !paso.soloAdmin || esAdmin)
      .map(paso => ({ paso, elemento: this.buscarVisible(paso.id) }))
      .filter((item): item is { paso: PasoTour; elemento: HTMLElement } => !!item.elemento);

    tour.addStep({
      id: 'bienvenida',
      title: '¡Bienvenido a AlertBxt!',
      text: 'Te mostramos rápidamente lo principal. Puedes omitir el recorrido cuando quieras.',
      buttons: this.botones(tour, true, false),
    });

    pasos.forEach(({ paso, elemento }, index) => {
      tour.addStep({
        id: paso.id,
        title: paso.titulo,
        text: paso.texto,
        attachTo: { element: elemento, on: this.posicion(elemento) },
        buttons: this.botones(tour, false, index === pasos.length - 1),
      });
    });

    const terminar = () => this.marcarVisto(uid);
    tour.on('complete', terminar);
    tour.on('cancel', terminar);

    this.tour = tour;
    void tour.start();
  }

  private botones(tour: InstanceType<typeof Shepherd.Tour>, primero: boolean, ultimo: boolean) {
    return [
      { text: 'Omitir', secondary: true, action: () => tour.cancel() },
      { text: primero ? 'Comenzar' : ultimo ? 'Finalizar' : 'Siguiente', action: () => tour.next() },
    ];
  }

  // Los mismos data-tour existen en la barra lateral (escritorio) y en la
  // barra inferior/encabezado (móvil); solo uno de los dos está a la vista.
  private buscarVisible(id: string): HTMLElement | null {
    const candidatos = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`));
    return candidatos.find(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight;
    }) || null;
  }

  private posicion(el: HTMLElement): 'top' | 'right' | 'bottom' {
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight * 0.6) {
      return 'top';
    }
    return r.left < 320 ? 'right' : 'bottom';
  }

  private marcarVisto(uid: string): void {
    try {
      localStorage.setItem(this.clave(uid), '1');
    } catch {
      // ignorar: ver yaVisto()
    }
  }

  private clave(uid: string): string {
    return `ab_tour_visto_${uid}`;
  }
}
