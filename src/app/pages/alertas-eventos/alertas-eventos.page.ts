import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonTitle, IonButton, IonModal, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { FirestoreService } from 'src/services/firestore.service';

@Component({
  selector: 'app-alertas-eventos',
  templateUrl: './alertas-eventos.page.html',
  styleUrls: ['./alertas-eventos.page.scss'],
  standalone: true,
  imports: [ CommonModule, FormsModule, IonContent, IonButton, IonModal],
})
export class AlertasEventosPage implements OnInit {
  avisos: any[] = [];
  gruposAvisos: any[][] = [];
  currentPage = 0;
  modalAbierto = false;
  avisoSeleccionado: any = null;

  constructor(private firestoreService: FirestoreService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.firestoreService.getAvisos().subscribe({
      next: (data) => {
        this.avisos = data || [];
        this.agruparAvisos();
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Error cargando avisos:', error);
      },
    });
  }

  agruparAvisos() {
    const grupos = [];
    for (let i = 0; i < this.avisos.length; i += 3) {
      grupos.push(this.avisos.slice(i, i + 3));
    }
    this.gruposAvisos = grupos;
  }

  cambiarPagina(index: number) {
    this.currentPage = index;
  }

  abrirModal(aviso: any) {
    this.avisoSeleccionado = { ...aviso };
    this.modalAbierto = true;
    this.cdr.detectChanges();
  }

  cerrarModal() {
    this.modalAbierto = false;
    this.avisoSeleccionado = null;
  }

  scrollChanged(event: any) {}

  onModalPresent() {
    this.cdr.detectChanges();
  }
}
