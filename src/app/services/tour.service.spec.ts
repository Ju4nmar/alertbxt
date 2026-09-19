import { TestBed } from '@angular/core/testing';
import { TourService } from './tour.service';

describe('TourService', () => {
  const uid = 'usuario-tour-test';

  afterEach(() => localStorage.removeItem(`ab_tour_visto_${uid}`));

  it('recuerda por usuario que el recorrido ya se vio', () => {
    const service = TestBed.inject(TourService);
    expect(service.yaVisto(uid)).toBeFalse();

    localStorage.setItem(`ab_tour_visto_${uid}`, '1');
    expect(service.yaVisto(uid)).toBeTrue();
    expect(service.yaVisto('otro-usuario')).toBeFalse();
  });
});
