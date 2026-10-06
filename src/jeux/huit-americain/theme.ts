import type { Couleur } from './cartes';
import type { Effet } from './regles';

/**
 * Pack de thème par défaut du Huit américain (D-A1-09, D-B-01) : toutes les
 * couleurs, formes, symboles, durées et sons que l'écran utilise sont lus
 * ici. Un autre pack de thème n'aura qu'à fournir un objet du même type.
 *
 * Cartes génériques dessinées par le code (D-B-03) : valeur, symbole de
 * couleur et dos géométrique, sans reprendre de jeu de cartes du commerce.
 * Les sons sont de courtes notes synthétisées : aucun fichier à charger.
 */

/** Une note jouée par l'écran : fréquence en hertz, durée en millisecondes. */
export interface Note {
  frequence: number;
  duree: number;
}

export type Son = 'poser' | 'piocher' | 'aToi' | 'gagne' | 'perdu';

export interface ThemeHuitAmericain {
  /** Fond de l'écran. */
  fond: number;
  /** Tapis de la table, au centre. */
  tapis: number;
  /** Textes. */
  texte: string;
  texteDiscret: string;
  texteSurCouleur: string;
  police: string;
  /** Face des cartes. */
  carteFond: number;
  carteBordure: number;
  carteRayon: number;
  /** Couleur d'encre des cartes rouges et noires. */
  encreRouge: string;
  encreNoire: string;
  /** Couleurs de cartes écrites en rouge. */
  couleursRouges: readonly Couleur[];
  /** Symbole de chaque couleur de carte (Unicode, suivi du sélecteur « texte » pour éviter les emoji). */
  symboles: Record<Couleur, string>;
  /** Dos des cartes : fond, motif et bordure. */
  dosFond: number;
  dosMotif: number;
  dosBordure: number;
  /** Petit symbole marqué sur les cartes qui ont un effet. */
  symbolesEffets: Record<Effet, string>;
  /** Pastille de l'effet sur la carte. */
  pastilleEffet: number;
  /** Cartes jouables, pioche à toucher, joueur courant. */
  surbrillance: number;
  /** Opacité des cartes qu'on ne peut pas poser. */
  opaciteInjouable: number;
  /** Fond des badges adverses et des panneaux. */
  panneau: number;
  panneauBordure: number;
  /** Bouton d'action (Passer, couleurs, flèches). */
  bouton: number;
  boutonTexte: string;
  /** Pastille de pénalité « +2 ». */
  alerte: number;
  /** Voile derrière le choix de couleur. */
  voile: number;
  /** Durée d'une carte qui vole d'un endroit à l'autre, en millisecondes. */
  dureeAnimation: number;
  /** Sons de la partie : suite de notes. */
  sons: Record<Son, readonly Note[]>;
  /** Volume des sons, de 0 à 1. */
  volume: number;
}

export const THEME_PAR_DEFAUT: ThemeHuitAmericain = {
  fond: 0xf4f1ea,
  tapis: 0x2f6b4f,
  texte: '#1f2430',
  texteDiscret: '#5b6170',
  texteSurCouleur: '#ffffff',
  police: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  carteFond: 0xffffff,
  carteBordure: 0x9a9384,
  carteRayon: 10,
  encreRouge: '#c62828',
  encreNoire: '#1f2430',
  couleursRouges: ['coeur', 'carreau'],
  symboles: { pique: '♠\uFE0E', coeur: '♥\uFE0E', carreau: '♦\uFE0E', trefle: '♣\uFE0E' },
  dosFond: 0x1b2a4a,
  dosMotif: 0x3b5287,
  dosBordure: 0xffffff,
  symbolesEffets: { aucun: '', joker: '★', piocher2: '+2', sauter: '⊘', sens: '⇄', rejouer: '↻' },
  pastilleEffet: 0xffb300,
  surbrillance: 0xffb300,
  opaciteInjouable: 0.55,
  panneau: 0xffffff,
  panneauBordure: 0xd9d4c7,
  bouton: 0x1b2a4a,
  boutonTexte: '#ffffff',
  alerte: 0xd32f2f,
  voile: 0x000000,
  dureeAnimation: 260,
  sons: {
    poser: [{ frequence: 520, duree: 60 }],
    piocher: [{ frequence: 330, duree: 70 }],
    aToi: [
      { frequence: 660, duree: 80 },
      { frequence: 880, duree: 110 },
    ],
    gagne: [
      { frequence: 523, duree: 120 },
      { frequence: 659, duree: 120 },
      { frequence: 784, duree: 220 },
    ],
    perdu: [
      { frequence: 392, duree: 160 },
      { frequence: 311, duree: 260 },
    ],
  },
  volume: 0.15,
};

/** Convertit une couleur CSS « #rrggbb » en nombre, comme Phaser les attend. */
export function couleurNumerique(css: string): number {
  return /^#[0-9a-f]{6}$/i.test(css) ? Number.parseInt(css.slice(1), 16) : 0x777777;
}
