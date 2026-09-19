import { Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';

// Anima un número desde su valor anterior hasta el nuevo. Con
// prefers-reduced-motion (o si el número no cambia) lo muestra directo.
@Directive({ selector: '[appContador]', standalone: true })
export class ContadorDirective implements OnChanges, OnDestroy {
  @Input('appContador') valor = 0;
  @Input() appContadorSufijo = '';

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly ngZone = inject(NgZone);
  private mostrado = 0;
  private frame = 0;

  ngOnChanges(): void {
    this.cancelar();
    const destino = Number(this.valor) || 0;
    const reducir = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducir || destino === this.mostrado) {
      this.pintar(destino);
      return;
    }

    const inicio = this.mostrado;
    const duracion = 700;
    const t0 = performance.now();

    this.ngZone.runOutsideAngular(() => {
      const paso = (ahora: number) => {
        const p = Math.min((ahora - t0) / duracion, 1);
        const suave = 1 - Math.pow(1 - p, 3);
        this.pintar(Math.round(inicio + (destino - inicio) * suave));
        if (p < 1) {
          this.frame = requestAnimationFrame(paso);
        }
      };
      this.frame = requestAnimationFrame(paso);
    });
  }

  ngOnDestroy(): void {
    this.cancelar();
  }

  private pintar(n: number): void {
    this.mostrado = n;
    this.el.nativeElement.textContent = `${n}${this.appContadorSufijo}`;
  }

  private cancelar(): void {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }
}
