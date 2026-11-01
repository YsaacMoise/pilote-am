// Accès au service en ligne pour la page des parents : sans compte, sans les données du téléphone.
import type { Backend } from '../sync/backend';

export async function shareBackend(): Promise<Backend> {
  if (import.meta.env.VITE_FAKE_CLOUD) return (await import('../sync/backend-fake')).backend;
  return (await import('../sync/backend-firebase')).backend;
}
