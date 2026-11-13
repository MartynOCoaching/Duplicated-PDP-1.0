/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
const MAX_DIMENSION = 1600;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please select a valid image.');
  }

  const bitmap = await createImageBitmap(file);

  try {
    let width = bitmap.width;
    let height = bitmap.height;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not process the image.');

    context.drawImage(bitmap, 0, 0, width, height);

    // JPEG does not support transparency. Use a white background.
    context.globalCompositeOperation = 'destination-over';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'source-over';

    const toBlob = (quality: number) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          blob => blob
            ? resolve(blob)
            : reject(new Error('Could not compress the image.')),
          'image/jpeg',
          quality
        );
      });

    let quality = 0.85;
    let blob = await toBlob(quality);

    while (blob.size > MAX_FILE_BYTES && quality > 0.4) {
      quality -= 0.1;
      blob = await toBlob(quality);
    }

    // If quality reduction isn't enough, progressively resize.
    while (blob.size > MAX_FILE_BYTES && canvas.width > 400) {
      const nextWidth = Math.round(canvas.width * 0.8);
      const nextHeight = Math.round(canvas.height * 0.8);

      canvas.width = nextWidth;
      canvas.height = nextHeight;
      context.drawImage(bitmap, 0, 0, nextWidth, nextHeight);

      quality = 0.75;
      blob = await toBlob(quality);
    }

    if (blob.size > MAX_FILE_BYTES) {
      throw new Error('This image could not be compressed below 1.5 MB. Please choose another image.');
    }

    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, '') || 'profile-photo'}.jpg`,
      { type: 'image/jpeg', lastModified: Date.now() }
    );
  } finally {
    bitmap.close();
  }
}
