import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { RegistroPage } from './registro.page';

class MockAuthService {}
class MockRouter {
  navigate = jasmine.createSpy('navigate');
}

describe('RegistroPage', () => {
  let component: RegistroPage;
  let fixture: ComponentFixture<RegistroPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistroPage, FormsModule, IonicModule],
      providers: [
        { provide: AuthService, useClass: MockAuthService },
        { provide: Router, useClass: MockRouter }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(RegistroPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
