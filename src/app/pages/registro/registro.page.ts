import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonCheckbox, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonInput, IonButton, IonItem, IonHeader, IonToolbar, IonTitle, IonCheckbox, IonLabel],
})
export class RegistroPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  nombreComunidad = '';
  administradorNombre = '';
  administradorCorreo = '';
  administradorCelular = '';
  password = '';
  confirmPassword = '';
  aceptaTerminos = false;
  isLoading = false;
  registroError = '';

  async createComunidad(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.registroError = '';

    const nombreComunidad = this.nombreComunidad.trim();
    const administradorNombre = this.administradorNombre.trim();
    const administradorCorreo = this.administradorCorreo.trim();
    const administradorCelular = this.administradorCelular.trim();

    if (!nombreComunidad || !administradorNombre || !administradorCorreo || !administradorCelular || !this.password || !this.confirmPassword) {
      this.registroError = 'Completa todos los campos requeridos.';
      return;
    }

    if (
      nombreComunidad.length < 3 || nombreComunidad.length > 60 ||
      administradorNombre.length < 3 || administradorNombre.length > 80 ||
      administradorCorreo.length > 120 ||
      administradorCelular.length < 7 || administradorCelular.length > 15 ||
      this.password.length < 8 || this.password.length > 40
    ) {
      this.registroError = 'Revisa la longitud de los campos del formulario.';
      return;
    }

    if (!this.isValidEmail(administradorCorreo) || !this.isValidPhone(administradorCelular)) {
      this.registroError = 'Revisa el formato del correo o el celular.';
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.registroError = 'Las contrasenas no coinciden.';
      return;
    }

    if (!this.aceptaTerminos) {
      this.registroError = 'Debes aceptar los terminos y condiciones.';
      return;
    }

    this.isLoading = true;
    try {
      await firstValueFrom(this.authService.registerAdminAndCreateComunidad({
        nombreComunidad,
        administradorNombre,
        administradorCorreo,
        administradorCelular,
        contrasena: this.password,
        aceptaTerminos: this.aceptaTerminos,
      }));
      this.router.navigate(['/alertas-eventos']);
    } catch (error) {
      console.error('Error creando comunidad:', error);
      this.registroError = this.getRegisterErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  private getRegisterErrorMessage(error: unknown): string {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    if (code === 'auth/email-already-in-use') {
      return 'Este correo ya esta registrado.';
    }

    if (code === 'auth/invalid-email') {
      return 'El correo no tiene un formato valido.';
    }

    if (code === 'auth/weak-password') {
      return 'La contrasena es demasiado debil.';
    }

    return 'No se pudo crear la vecindad. Intenta nuevamente.';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidPhone(phone: string): boolean {
    return /^[0-9+ ]{7,15}$/.test(phone);
  }
}
