import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { ErrorLoggingService } from './services/error-logging.service';

// ErrorHandler se instancia antes que el resto de la app termine de
// arrancar, así que ErrorLoggingService se obtiene de forma perezosa (vía
// Injector) en vez de inyectarse directamente en el constructor.
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    console.error('Error no controlado:', error);

    try {
      this.injector.get(ErrorLoggingService).registrarError(error);
    } catch (loggingError) {
      console.error('No se pudo registrar el error:', loggingError);
    }
  }
}
