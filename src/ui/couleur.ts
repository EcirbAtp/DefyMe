/**
 * Couleur du joueur appliquée à l'interface : elle devient la couleur
 * d'accent (onglet actif, boutons), avec un texte noir ou blanc selon ce qui
 * se lit le mieux dessus.
 */
export function texteLisibleSur(couleur: string): '#000000' | '#ffffff' {
  const hex = /^#([0-9a-f]{6})$/i.exec(couleur)?.[1];
  if (!hex) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contraste avec le noir (L + 0,05) / 0,05 contre le blanc 1,05 / (L + 0,05).
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}

export function appliquerCouleur(couleur: string, racine: HTMLElement = document.documentElement): void {
  racine.style.setProperty('--accent', couleur);
  racine.style.setProperty('--accent-texte', texteLisibleSur(couleur));
}
