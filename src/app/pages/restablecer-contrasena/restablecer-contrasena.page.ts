import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth, confirmPasswordReset, verifyPasswordResetCode } from '@angular/fire/auth';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonInput, IonItem } from '@ionic/angular/standalone';
import { getFirebaseErrorCode } from '../../utils/auth-form.utils';

type Estado = 'verificando' | 'listo' | 'invalido' | 'exito';

// Destino del enlace del correo de recuperación: aquí se elige la contraseña
// nueva con el mismo diseño de la app (en vez de la página genérica de Firebase).
@Component({
  selector: 'app-restablecer-contrasena',
  templateUrl: './restablecer-contrasena.page.html',
  // Mismo estilo que el resto de pantallas de acceso.
  styleUrls: ['../forgot-password/forgot-password.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonInput, IonButton, IonItem],
})
export class RestablecerContrasenaPage implements OnInit {
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  estado: Estado = 'verificando';
  correo = '';
  password = '';
  confirmPassword = '';
  isLoading = false;
  error = '';
  private oobCode = '';

  async ngOnInit(): Promise<void> {
    this.oobCode = this.route.snapshot.queryParamMap.get('oobCode') ?? '';
    if (!this.oobCode) {
      this.estado = 'invalido';
      return;
    }

    try {
      this.correo = await verifyPasswordResetCode(this.auth, this.oobCode);
      this.estado = 'listo';
    } catch (error) {
      console.warn('Enlace de recuperación no válido:', error);
      this.estado = 'invalido';
    }
  }

  get coinciden(): boolean {
    return this.password === this.confirmPassword;
  }

  get puedeGuardar(): boolean {
    return this.password.length >= 8 && this.password.length <= 40 && this.coinciden && !this.isLoading;
  }

  async guardar(): Promise<void> {
    if (!this.puedeGuardar) {
      return;
    }

    this.isLoading = true;
    this.error = '';
    try {
      await confirmPasswordReset(this.auth, this.oobCode, this.password);
      this.estado = 'exito';
    } catch (error) {
      console.error('Error restableciendo contraseña:', error);
      const code = getFirebaseErrorCode(error);
      if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
        this.estado = 'invalido';
      } else if (code === 'auth/weak-password') {
        this.error = 'La contraseña es muy débil. Usa al menos 8 caracteres.';
      } else {
        this.error = 'No se pudo cambiar la contraseña. Intenta nuevamente.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  irALogin(): void {
    void this.router.navigate(['/login']);
  }

  pedirOtroEnlace(): void {
    void this.router.navigate(['/forgot-password']);
  }
}
