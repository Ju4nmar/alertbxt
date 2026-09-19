import { Injectable } from '@angular/core';

export type ThemePreference = 'light' | 'dark';

const STORAGE_KEY = 'ab-theme-preference';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private preference: ThemePreference = this.readStoredPreference();

  constructor() {
    this.applyToDocument();
  }

  getPreference(): ThemePreference {
    return this.preference;
  }

  setPreference(preference: ThemePreference): void {
    this.preference = preference;
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch (error) {
      // localStorage puede no estar disponible (modo privado): el tema
      // manual simplemente no persiste entre sesiones, pero sigue
      // aplicándose en la actual.
      console.warn('No se pudo guardar la preferencia de tema:', error);
    }
    this.applyToDocument();
  }

  toggle(): void {
    this.setPreference(this.preference === 'dark' ? 'light' : 'dark');
  }

  // Sin opción "Automático": el tema es 100% manual desde el primer
  // arranque, pero la primera vez (nada guardado todavía) toma el tema del
  // sistema operativo como punto de partida en vez de asumir claro siempre.
  private readStoredPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // ignorar y calcular el valor por defecto abajo
    }

    return this.prefiereOscuroElSistema() ? 'dark' : 'light';
  }

  private prefiereOscuroElSistema(): boolean {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  }

  private applyToDocument(): void {
    document.documentElement.setAttribute('data-theme', this.preference);
  }
}
