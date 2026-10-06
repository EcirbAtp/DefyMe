/**
 * Cartes d'un jeu de 52 : quatre couleurs, treize valeurs.
 * Une carte est un objet simple pour passer sans souci en JSON.
 */

export const COULEURS = ['pique', 'coeur', 'carreau', 'trefle'] as const;
export type Couleur = (typeof COULEURS)[number];

/** Valeurs dans l'ordre : as, 2 à 10, valet, dame, roi. */
export const RANGS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'] as const;
export type Rang = (typeof RANGS)[number];

export interface Carte {
  rang: Rang;
  couleur: Couleur;
}

/** `nombre` jeux de 52 cartes, dans l'ordre (à mélanger ensuite). */
export function paquet(nombre: number): Carte[] {
  const cartes: Carte[] = [];
  for (let i = 0; i < nombre; i++) {
    for (const couleur of COULEURS) {
      for (const rang of RANGS) cartes.push({ rang, couleur });
    }
  }
  return cartes;
}

export function memeCarte(a: Carte, b: Carte): boolean {
  return a.rang === b.rang && a.couleur === b.couleur;
}

/** Ordre d'affichage d'une main : par couleur, puis par valeur. */
export function comparerCartes(a: Carte, b: Carte): number {
  return COULEURS.indexOf(a.couleur) - COULEURS.indexOf(b.couleur) || RANGS.indexOf(a.rang) - RANGS.indexOf(b.rang);
}

/** Texte court pour les messages et les tests : « 10♥ », « V♠ ». */
export function libelle(carte: Carte): string {
  const symbole: Record<Couleur, string> = { pique: '♠', coeur: '♥', carreau: '♦', trefle: '♣' };
  return `${carte.rang}${symbole[carte.couleur]}`;
}
