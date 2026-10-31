// Logo « Les Galets d'Équilibre » : deux galets (les adultes) qui se penchent l'un vers l'autre, une perle d'argile (l'enfant).
// Les galets prennent la couleur du texte (encre), la perle la couleur d'accent : le logo suit le mode clair ou sombre.
export function Logo({ size, class: cls }: { size?: number; class?: string }) {
  return (
    <svg class={`logo ${cls ?? ''}`} viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="33" y="18" width="20" height="78" rx="10" transform="rotate(19 43 57)" fill="currentColor" />
      <rect x="67" y="18" width="20" height="78" rx="10" transform="rotate(-19 77 57)" fill="currentColor" opacity="0.88" />
      <circle cx="60" cy="73" r="11.5" fill="var(--accent)" />
    </svg>
  );
}
