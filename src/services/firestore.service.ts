import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  constructor(private firestore: Firestore) {}

  getAvisos() {
    const col = collection(this.firestore, 'avisos');
    return collectionData(col, { idField: 'id' }).pipe(
      map(data => data || [])
    );
  }
}