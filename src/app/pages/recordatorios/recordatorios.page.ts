import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar, IonItem, IonLabel, IonButton } from '@ionic/angular/standalone';

@Component({
  selector: 'app-recordatorios',
  templateUrl: './recordatorios.page.html',
  styleUrls: ['./recordatorios.page.scss'],
  standalone: true,
  imports: [IonButton, IonLabel, IonItem, IonContent, CommonModule, FormsModule]
})
export class RecordatoriosPage {

  recordatorios: any[] = [];
  titulo = '';
  descripcion = '';
  fechaHora = '';
  idEditando: number | null = null;

  guardarRecordatorio() {
    if (!this.titulo.trim()) return;

    if (this.idEditando !== null) {
      const index = this.recordatorios.findIndex(r => r.id === this.idEditando);
      if (index !== -1) {
        this.recordatorios[index] = {
          id: this.idEditando,
          titulo: this.titulo,
          descripcion: this.descripcion,
          fechaHora: this.fechaHora,
        };
      }
      this.idEditando = null;
    } else {
      this.recordatorios.push({
        id: Date.now(),
        titulo: this.titulo,
        descripcion: this.descripcion,
        fechaHora: this.fechaHora,
      });
    }

    this.titulo = '';
    this.descripcion = '';
    this.fechaHora = '';
  }

  editarRecordatorio(recordatorio: any) {
    this.titulo = recordatorio.titulo;
    this.descripcion = recordatorio.descripcion;
    this.fechaHora = recordatorio.fechaHora;
    this.idEditando = recordatorio.id;
  }

  eliminarRecordatorio(id: number) {
    this.recordatorios = this.recordatorios.filter(r => r.id !== id);
  }
}
