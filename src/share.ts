// Partage via la feuille de partage iOS. Pour un fichier : le fichier SEUL, sans texte ni titre
// (bug WebKit 244408 : avec un texte, iOS n'enregistre que le texte dans Fichiers).

export type ShareResult = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed';

export async function shareFile(file: File): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export async function shareText(text: string): Promise<ShareResult> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function jsonFile(name: string, data: unknown): File {
  return new File([JSON.stringify(data, null, 1)], name, { type: 'application/json' });
}
