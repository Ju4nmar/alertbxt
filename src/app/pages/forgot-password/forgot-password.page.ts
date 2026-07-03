import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth, sendPasswordResetEmail } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonHeader, IonInput, IonItem, IonTitle, IonToolbar } from '@ionic/angular/standalone';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonInput, IonButton, IonItem, IonHeader, IonToolbar, IonTitle],
})
export class ForgotPasswordPage {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  email = '';
  isLoading = false;
  resetError = '';
  resetSuccess = '';

  async resetPassword(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.resetError = '';
    this.resetSuccess = '';
    const email = this.email.trim();

    if (!email) {
      this.resetError = 'Ingresa tu correo electronico.';
      return;
    }

    if (!this.isValidEmail(email) || email.length > 120) {
      this.resetError = 'Ingresa un correo valido.';
      return;
    }

    this.isLoading = true;
    try {
      await sendPasswordResetEmail(this.auth, email);
      this.resetSuccess = 'Enlace de recuperacion enviado a tu correo.';
    } catch (error) {
      console.error('Error enviando enlace:', error);
      this.resetError = this.getResetErrorMessage(error);
    } finally {
      this.isLoading = false;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  private getResetErrorMessage(error: unknown): string {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    if (code === 'auth/invalid-email') {
      return 'El correo no tiene un formato valido.';
    }

    if (code === 'auth/user-not-found') {
      return 'No encontramos una cuenta con ese correo.';
    }

    return 'No se pudo enviar el enlace. Intenta nuevamente.';
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
