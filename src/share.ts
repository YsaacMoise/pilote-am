/**
 * Partage par la feuille de partage de l'iPhone (SMS, WhatsApp, courriel, Fichiers).
 * Sur iOS, un fichier se partage seul, sans texte joint (bug WebKit 244408).
 */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable';

export async function shareText(text: string, title?: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(title ? { title, text } : { text });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  return copyText(text);
}

export async function copyText(text: string): Promise<ShareOutcome> {
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}

export async function shareFile(content: string, filename: string, mime: string): Promise<ShareOutcome> {
  const file = new File([content], filename, { type: mime });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  // Ordinateur : téléchargement classique
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'shared';
  } catch {
    return 'unavailable';
  }
}

/** Ouvre le sélecteur de fichiers et renvoie le fichier choisi (ou null). */
export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.position = 'fixed';
    input.style.left = '-1000px';
    input.addEventListener('change', () => {
      resolve(input.files ? [...input.files] : []);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}
