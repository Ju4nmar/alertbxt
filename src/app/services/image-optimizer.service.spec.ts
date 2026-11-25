import { ImageOptimizerService } from './image-optimizer.service';

describe('ImageOptimizerService', () => {
  let service: ImageOptimizerService;
  let close: jasmine.Spy;
  let drawImage: jasmine.Spy;
  let encode: jasmine.Spy;
  const original = new File([new Uint8Array(64)], 'foto conjunto.png', { type: 'image/png' });

  beforeEach(() => {
    service = new ImageOptimizerService();
    close = jasmine.createSpy('close');
    spyOn(window, 'createImageBitmap').and.resolveTo({ width: 3200, height: 1200, close });
    drawImage = jasmine.createSpy('drawImage');
    spyOn(HTMLCanvasElement.prototype, 'getContext').and.returnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    encode = spyOn(HTMLCanvasElement.prototype, 'toBlob');
  });

  it('reduce el tamaño conservando la proporción, limita la calidad y genera un WebP menor', async () => {
    const blob = new Blob(['webp'], { type: 'image/webp' });
    encode.and.callFake((callback: BlobCallback) => callback(blob));
    const resultado = await service.optimize(original, 1);
    expect(drawImage).toHaveBeenCalledOnceWith(jasmine.objectContaining({ width: 3200 }), 0, 0, 1600, 600);
    expect(encode).toHaveBeenCalledOnceWith(jasmine.any(Function), 'image/webp', 0.8);
    expect(resultado.file.name).toBe('foto_conjunto.webp');
    expect(resultado.file.type).toBe('image/webp');
    expect(resultado.optimizedSize).toBe(blob.size);
    expect(resultado.originalSize).toBe(original.size);
    expect(resultado.convertedToWebp).toBeTrue();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('recurre al PNG original como formato de salida si WebP no está disponible', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    encode.and.callFake((callback: BlobCallback, type: string) => callback(type === 'image/png' ? png : null));
    const resultado = await service.optimize(original, 0.1);
    expect(encode.calls.allArgs().map(([, type, quality]) => [type, quality]))
      .toEqual([['image/webp', 0.6], ['image/png', 0.6]]);
    expect(resultado.file.name).toBe('foto_conjunto.png');
    expect(resultado.convertedToWebp).toBeFalse();
  });

  it('conserva el archivo original si la conversión aumentaría su tamaño', async () => {
    encode.and.callFake((callback: BlobCallback) =>
      callback(new Blob([new Uint8Array(128)], { type: 'image/webp' })));
    const resultado = await service.optimize(original);
    expect(resultado.file).toBe(original);
    expect(resultado.optimizedSize).toBe(original.size);
  });

  it('informa que no puede optimizar si el navegador no entrega un contexto 2D', async () => {
    (HTMLCanvasElement.prototype.getContext as jasmine.Spy).and.returnValue(null);
    await expectAsync(service.optimize(original))
      .toBeRejectedWithError('No se pudo preparar la optimizacion de imagen');
    expect(encode).not.toHaveBeenCalled();
  });
});
