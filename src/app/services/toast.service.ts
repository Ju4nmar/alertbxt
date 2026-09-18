import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastController = inject(ToastController);

  async success(message: string): Promise<void> {
    await this.show(message, 'success');
  }

  async error(message: string): Promise<void> {
    await this.show(message, 'danger');
  }

  private async show(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3200,
      position: 'top',
      color,
    });
    await toast.present();
  }
}
