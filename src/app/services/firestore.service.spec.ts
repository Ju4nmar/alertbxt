import { TestBed } from '@angular/core/testing';
import { Firestore } from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { FirestoreService } from './firestore.service';

describe('FirestoreService', () => {
  it('impide que un usuario no administrador actualice el estado de otro usuario', async () => {
    const updateDocSpy = jasmine.createSpy('updateDoc');

    await TestBed.configureTestingModule({
      providers: [
        FirestoreService,
        { provide: Firestore, useValue: { updateDoc: updateDocSpy } },
        {
          provide: AuthService,
          useValue: {
            getCurrentUser: () => ({
              idUsuario: 'residente-1',
              nombre: 'Residente',
              correo: 'residente@alertbxt.test',
              telefono: '3000000000',
              rol: 'residente',
              activo: true,
              comunidadId: 'comunidad-1',
            }),
          },
        },
      ],
    }).compileComponents();

    const service = TestBed.inject(FirestoreService);

    await expectAsync(firstValueFrom(service.updateUsuarioEstado('residente-2', { activo: false })))
      .toBeRejectedWithError('Solo un administrador puede actualizar el estado de usuarios');
    expect(updateDocSpy).not.toHaveBeenCalled();
  });
});
