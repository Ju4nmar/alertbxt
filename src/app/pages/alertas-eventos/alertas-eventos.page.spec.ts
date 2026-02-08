import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertasEventosPage } from './alertas-eventos.page';

describe('AlertasEventosPage', () => {
  let component: AlertasEventosPage;
  let fixture: ComponentFixture<AlertasEventosPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AlertasEventosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
