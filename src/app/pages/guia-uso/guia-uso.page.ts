import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { IonAccordion, IonAccordionGroup, IonContent, IonIcon, IonItem, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  calendarOutline,
  chatbubbleEllipsesOutline,
  notificationsOutline,
  peopleOutline,
  personOutline,
  statsChartOutline,
} from 'ionicons/icons';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-guia-uso',
  templateUrl: './guia-uso.page.html',
  styleUrls: ['./guia-uso.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonAccordionGroup, IonAccordion, IonItem, IonLabel, IonIcon],
})
export class GuiaUsoPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  esAdmin = false;

  constructor() {
    addIcons({
      peopleOutline,
      alertCircleOutline,
      calendarOutline,
      chatbubbleEllipsesOutline,
      notificationsOutline,
      statsChartOutline,
      personOutline,
    });
  }

  ngOnInit(): void {
    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
        this.esAdmin = user?.rol === 'admin';
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
