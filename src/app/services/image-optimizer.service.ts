import { Injectable } from '@angular/core';

export interface OptimizedImage {
  file: File;
  originalSize: number;
  optimizedSize: number;
  convertedToWebp: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ImageOptimizerService {
  private readonly defaultQuality = 0.75;
  private readonly maxWidth = 1600;
  private readonly maxHeight = 1600;

  async optimize(file: File, quality = this.defaultQuality): Promise<OptimizedImage> {
    const safeQuality = Math.min(0.8, Math.max(0.6, quality));
    const bitmap = await this.loadImage(file);
    const { width, height } = this.getTargetSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('No se pudo preparar la optimizacion de imagen');
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    const webpBlob = await this.canvasToBlob(canvas, 'image/webp', safeQuality);
    const fallbackBlob = webpBlob || await this.canvasToBlob(canvas, file.type || 'image/jpeg', safeQuality);
    const optimizedBlob = fallbackBlob && fallbackBlob.size < file.size ? fallbackBlob : file;
    const convertedToWebp = optimizedBlob instanceof Blob && optimizedBlob.type === 'image/webp';
    const optimizedName = this.getOptimizedName(file.name, convertedToWebp ? 'webp' : this.getExtension(file));
    const optimizedFile = optimizedBlob instanceof File
      ? optimizedBlob
      : new File([optimizedBlob], optimizedName, { type: optimizedBlob.type, lastModified: Date.now() });

    this.closeBitmap(bitmap);

    return {
      file: optimizedFile,
      originalSize: file.size,
      optimizedSize: optimizedFile.size,
      convertedToWebp,
    };
  }

  private async loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if ('createImageBitmap' in window) {
      return createImageBitmap(file, { imageOrientation: 'from-image' });
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen seleccionada'));
      };
      img.src = url;
    });
  }

  private getTargetSize(width: number, height: number): { width: number; height: number } {
    const ratio = Math.min(1, this.maxWidth / width, this.maxHeight / height);
    return {
      width: Math.round(width * ratio),
      height: Math.round(height * ratio),
    };
  }

  private canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(resolve, type, quality));
  }

  private getOptimizedName(name: string, extension: string): string {
    const baseName = name.replace(/\.[^.]+$/, '').replace(/[^\w.-]/g, '_') || 'imagen';
    return `${baseName}.${extension}`;
  }

  private getExtension(file: File): string {
    if (file.type === 'image/png') {
      return 'png';
    }

    if (file.type === 'image/webp') {
      return 'webp';
    }

    return 'jpg';
  }

  private closeBitmap(bitmap: ImageBitmap | HTMLImageElement): void {
    if ('close' in bitmap) {
      bitmap.close();
    }
  }
}
