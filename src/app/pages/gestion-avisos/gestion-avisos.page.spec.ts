import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GestionAvisosPage } from './gestion-avisos.page';

describe('GestionAvisosPage', () => {
  let component: GestionAvisosPage;
  let fixture: ComponentFixture<GestionAvisosPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(GestionAvisosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
