import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonCheckbox, IonContent, IonInput, IonItem, IonLabel } from '@ionic/angular/standalone';
import { combineLatest, filter, firstValueFrom, take } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { getFirebaseErrorCode, isValidEmail, isValidPhone } from '../../utils/auth-form.utils';

@Component({
  selector: 'app-unirse-vecindad',
  templateUrl: './unirse-vecindad.page.html',
  styleUrls: ['./unirse-vecindad.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonInput, IonButton, IonItem, IonCheckbox, IonLabel],
})
export class UnirseVecindadPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  nombre = '';
  correo = '';
  telefono = '';
  numeroApartamento = '';
  password = '';
  confirmPassword = '';
  codigoInvitacion = '';
  aceptaTerminos = false;
  isLoading = false;
  isGoogleLoading = false;
  isLoggedIn = false;
  joinError = '';

  ngOnInit(): void {
    this.codigoInvitacion = this.route.snapshot.queryParamMap.get('codigo') || '';

    // Espera a que Firebase Auth resuelva la sesión antes de decidir si el
    // usuario ya está autenticado: en una carga de página fresca,
    // getCurrentUser() aún no tiene el usuario disponible de forma
    // síncrona y esta pantalla mostraba el formulario público completo
    // (con contraseña) aunque hubiera una sesión activa.
    combineLatest([this.authService.authReady$, this.authService.currentUser$]).pipe(
      filter(([ready]) => ready),
      take(1)
    ).subscribe(([, currentUser]) => {
      this.isLoggedIn = !!currentUser;
      this.nombre = currentUser?.nombre || '';
      this.correo = currentUser?.correo || '';
      this.telefono = currentUser?.telefono || '';
      this.numeroApartamento = currentUser?.numeroApartamento || '';
    });
  }

  async joinComunidad(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.joinError = '';
    const codigoInvitacion = this.codigoInvitacion.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(codigoInvitacion)) {
      this.joinError = 'El código debe tener 8 letras o números.';
      return;
    }

    if (!this.isLoggedIn && !this.formularioRegistroValido()) {
      return;
    }

    this.isLoading = true;
    try {
      if (this.isLoggedIn) {
        await firstValueFrom(this.authService.joinComunidad(codigoInvitacion));
      } else {
        await firstValueFrom(this.authService.registerResidentAndJoinComunidad({
          nombre: this.nombre.trim(),
          correo: this.correo.trim(),
          telefono: this.telefono.trim(),
          numeroApartamento: this.numeroApartamento.trim(),
          password: this.password,
          codigoInvitacion,
          aceptaTerminos: this.aceptaTerminos,
        }));
      }

      this.router.navigate(['/alertas-eventos']);
    } catch (error) {
      console.error('Error uniendose a comunidad:', error);
      this.joinError = this.getJoinErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  async joinWithGoogle(): Promise<void> {
    if (this.isLoading || this.isGoogleLoading) {
      return;
    }

    this.joinError = '';
    const codigoInvitacion = this.codigoInvitacion.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(codigoInvitacion)) {
      this.joinError = 'Ingresa un código de invitación válido antes de continuar con Google.';
      return;
    }

    if (!this.aceptaTerminos) {
      this.joinError = 'Debes aceptar el tratamiento de tus datos personales.';
      return;
    }

    this.isGoogleLoading = true;
    try {
      await firstValueFrom(this.authService.joinComunidadWithGoogle(codigoInvitacion, this.aceptaTerminos));
      this.router.navigate(['/alertas-eventos']);
    } catch (error) {
      console.error('Error uniéndose con Google:', error);
      this.joinError = this.getGoogleErrorMessage(error);
    } finally {
      this.isGoogleLoading = false;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  private formularioRegistroValido(): boolean {
    const nombre = this.nombre.trim();
    const correo = this.correo.trim();
    const telefono = this.telefono.trim();
    const numeroApartamento = this.numeroApartamento.trim();

    if (!nombre || !correo || !telefono || !numeroApartamento || !this.password || !this.confirmPassword) {
      this.joinError = 'Completa todos los campos requeridos.';
      return false;
    }

    if (
      nombre.length < 3 || nombre.length > 80 ||
      correo.length > 120 ||
      telefono.length < 7 || telefono.length > 15 ||
      numeroApartamento.length > 20 ||
      this.password.length < 8 || this.password.length > 40
    ) {
      this.joinError = 'Revisa la longitud de los campos del formulario.';
      return false;
    }

    if (!isValidEmail(correo) || !isValidPhone(telefono)) {
      this.joinError = 'Revisa el formato del correo o del teléfono.';
      return false;
    }

    if (this.password !== this.confirmPassword) {
      this.joinError = 'Las contraseñas no coinciden.';
      return false;
    }

    if (!this.aceptaTerminos) {
      this.joinError = 'Debes aceptar el tratamiento de tus datos personales.';
      return false;
    }

    return true;
  }

  private getJoinErrorMessage(error: unknown): string {
    const code = getFirebaseErrorCode(error);

    if (code === 'auth/email-already-in-use') {
      return 'Este correo ya está registrado. Inicia sesión para unirte.';
    }

    if (code === 'auth/invalid-email') {
      return 'El correo no tiene un formato válido.';
    }

    if (code === 'auth/weak-password') {
      return 'La contraseña es demasiado débil.';
    }

    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('código') || message.includes('codigo')) {
      return 'El código de invitación no es válido.';
    }

    return 'No se pudo unir a la vecindad. Intenta nuevamente.';
  }

  private getGoogleErrorMessage(error: unknown): string {
    const code = getFirebaseErrorCode(error);

    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return '';
    }

    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'No se pudo unir con Google. Inténtalo de nuevo.';
  }
}
