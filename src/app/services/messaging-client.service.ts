import { Injectable, inject } from '@angular/core';
import { Messaging, MessagePayload, getToken, onMessage } from '@angular/fire/messaging';
import { GetTokenOptions } from 'firebase/messaging';

@Injectable({ providedIn: 'root' })
export class MessagingClientService {
  private readonly messaging = inject(Messaging);

  getToken(opciones: GetTokenOptions): Promise<string> {
    return getToken(this.messaging, opciones);
  }

  onMessage(callback: (payload: MessagePayload) => void): () => void {
    return onMessage(this.messaging, callback);
  }
}
