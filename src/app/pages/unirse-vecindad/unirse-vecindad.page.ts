import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonInput, IonItem, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-unirse-vecindad',
  templateUrl: './unirse-vecindad.page.html',
  styleUrls: ['./unirse-vecindad.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonInput, IonButton, IonItem, IonHeader, IonToolbar, IonTitle],
})
export class UnirseVecindadPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  nombre = '';
  correo = '';
  telefono = '';
  password = '';
  confirmPassword = '';
  codigoInvitacion = '';
  isLoading = false;
  isLoggedIn = false;
  joinError = '';

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.isLoggedIn = !!currentUser;
    this.nombre = currentUser?.nombre || '';
    this.correo = currentUser?.correo || '';
    this.telefono = currentUser?.telefono || '';
    this.codigoInvitacion = this.route.snapshot.queryParamMap.get('codigo') || '';
  }

  async joinComunidad(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.joinError = '';
    const codigoInvitacion = this.codigoInvitacion.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(codigoInvitacion)) {
      this.joinError = 'El codigo debe tener 8 letras o numeros.';
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
          password: this.password,
          codigoInvitacion,
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

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  private formularioRegistroValido(): boolean {
    const nombre = this.nombre.trim();
    const correo = this.correo.trim();
    const telefono = this.telefono.trim();

    if (!nombre || !correo || !telefono || !this.password || !this.confirmPassword) {
      this.joinError = 'Completa todos los campos requeridos.';
      return false;
    }

    if (
      nombre.length < 3 || nombre.length > 80 ||
      correo.length > 120 ||
      telefono.length < 7 || telefono.length > 15 ||
      this.password.length < 8 || this.password.length > 40
    ) {
      this.joinError = 'Revisa la longitud de los campos del formulario.';
      return false;
    }

    if (!this.isValidEmail(correo) || !this.isValidPhone(telefono)) {
      this.joinError = 'Revisa el formato del correo o el telefono.';
      return false;
    }

    if (this.password !== this.confirmPassword) {
      this.joinError = 'Las contrasenas no coinciden.';
      return false;
    }

    return true;
  }

  private getJoinErrorMessage(error: unknown): string {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    if (code === 'auth/email-already-in-use') {
      return 'Este correo ya esta registrado. Inicia sesion para unirte.';
    }

    if (code === 'auth/invalid-email') {
      return 'El correo no tiene un formato valido.';
    }

    if (code === 'auth/weak-password') {
      return 'La contrasena es demasiado debil.';
    }

    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('codigo')) {
      return 'El codigo de invitacion no es valido.';
    }

    return 'No se pudo unir a la vecindad. Intenta nuevamente.';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private isValidPhone(phone: string): boolean {
    return /^[0-9+ ]{7,15}$/.test(phone);
  }
}
