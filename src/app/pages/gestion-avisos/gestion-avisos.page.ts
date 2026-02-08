import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { updateDoc } from '@angular/fire/firestore';
import {
  Storage,
  ref,
  uploadBytes,
  getDownloadURL,
} from '@angular/fire/storage';
import {
  Firestore,
  collection,
  addDoc,
  collectionData,
  deleteDoc,
  doc,
} from '@angular/fire/firestore';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonSelectOption,
  IonInput,
  IonSelect,
  IonTextarea,
  IonItem,
  IonLabel,
  IonButton,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-gestion-avisos',
  templateUrl: './gestion-avisos.page.html',
  styleUrls: ['./gestion-avisos.page.scss'],
  standalone: true,
  imports: [
    IonButton,
    IonInput,
    IonSelect,
    IonTextarea,
    IonLabel,
    IonItem,
    IonContent,
    IonSelectOption,
    CommonModule,
    FormsModule,
  ],
})
export class GestionAvisosPage implements OnInit {
  avisos: any[] = [];
  idEditando: string | null = null;
  titulo: string = '';
  tipo: string = '';
  descripcion: string = '';
  archivo: File | null = null;
  imagenExistente: string | null = null;

  constructor(private firestore: Firestore, private storage: Storage) {}

  ngOnInit() {
    const avisosRef = collection(this.firestore, 'avisos');
    collectionData(avisosRef, { idField: 'id' }).subscribe((data) => {
      this.avisos = data;
    });
  }

  seleccionarArchivo(event: any) {
    this.archivo = event.target.files[0];
  }

  async guardarAviso() {
    if (!this.titulo || !this.tipo || !this.descripcion) return;

    let urlImagen = this.imagenExistente;

    if (this.archivo) {
      const ruta = `avisos/${Date.now()}_${this.archivo.name}`;
      const storageRef = ref(this.storage, ruta);
      await uploadBytes(storageRef, this.archivo);
      urlImagen = await getDownloadURL(storageRef);
    }

    if (this.idEditando) {
      const avisoRef = doc(this.firestore, `avisos/${this.idEditando}`);
      await updateDoc(avisoRef, {
        titulo: this.titulo,
        tipo: this.tipo,
        descripcion: this.descripcion,
        imagen: urlImagen,
      });
      this.idEditando = null;
    } else {
      const colRef = collection(this.firestore, 'avisos');
      await addDoc(colRef, {
        titulo: this.titulo,
        tipo: this.tipo,
        descripcion: this.descripcion,
        fecha: new Date().toISOString(),
        imagen: urlImagen,
      });
    }

    this.titulo = '';
    this.tipo = '';
    this.descripcion = '';
    this.archivo = null;
    this.imagenExistente = null;
  }

  eliminarAviso(id: string) {
    const avisoRef = doc(this.firestore, `avisos/${id}`);
    deleteDoc(avisoRef);
  }

  editarAviso(aviso: any) {
    this.idEditando = aviso.id;
    this.titulo = aviso.titulo;
    this.tipo = aviso.tipo;
    this.descripcion = aviso.descripcion;
    this.imagenExistente = aviso.imagen || null;
  }
}
