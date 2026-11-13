export async function downloadCanvasImage(
  canvas: HTMLCanvasElement,
  filename: string
): Promise<void> {
  // Mobile (especially iOS Safari) doesn't honour the anchor `download`
  // attribute for canvas data URLs — the share sheet is the only reliable
  // way to hand the image to the OS, where "Save Image" writes it to Photos.
  if (typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator) {
    try {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (blob) {
        const file = new File([blob], filename, { type: 'image/png' });
        const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
        if (nav.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      }
    } catch (err) {
      // User dismissed the share sheet — not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Any other share failure falls through to the plain download path.
    }
  }

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}
