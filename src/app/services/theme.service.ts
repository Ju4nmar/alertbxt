import { Injectable } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

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

  private readStoredPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // ignorar y usar 'system' por defecto
    }
    return 'system';
  }

  private applyToDocument(): void {
    if (this.preference === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', this.preference);
    }
  }
}
