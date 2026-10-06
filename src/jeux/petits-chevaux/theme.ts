/**
 * Pack de thème par défaut des Petits chevaux (D-A1-09, D-B-01) : toutes les
 * couleurs, tailles et formes que l'écran utilise sont lues ici. Un autre
 * pack de thème n'aura qu'à fournir un objet du même type.
 *
 * Plateau générique et original (D-B-03) : une croix sobre, sans reprendre
 * de plateau du commerce.
 */
export interface ThemePetitsChevaux {
  /** Fond derrière le plateau et le panneau. */
  fond: number;
  /** Fond du plateau. */
  plateau: number;
  /** Cases du parcours et leur bordure. */
  caseParcours: number;
  bordure: number;
  /** Couleur d'un côté sans joueur. */
  neutre: number;
  /** Texte du panneau et des marches. */
  texte: string;
  texteDiscret: string;
  /** Texte écrit sur les pions et les boutons de couleur. */
  texteSurCouleur: string;
  /** Police des textes. */
  police: string;
  /** Contour des pions et anneau des chevaux jouables. */
  contourPion: number;
  surbrillance: number;
  /** Fond du dé et de ses points. */
  de: number;
  pointsDe: number;
  /** Symbole dessiné au centre. */
  symboleCentre: string;
  /** Durée d'un déplacement de pion, en millisecondes. */
  dureeDeplacement: number;
}

export const THEME_PAR_DEFAUT: ThemePetitsChevaux = {
  fond: 0xf4f1ea,
  plateau: 0xfbfaf6,
  caseParcours: 0xffffff,
  bordure: 0x9a9384,
  neutre: 0xc9c3b6,
  texte: '#1f2430',
  texteDiscret: '#5b6170',
  texteSurCouleur: '#ffffff',
  police: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  contourPion: 0x1f2430,
  surbrillance: 0xffb300,
  de: 0xffffff,
  pointsDe: 0x1f2430,
  symboleCentre: '★',
  dureeDeplacement: 280,
};

/** Convertit une couleur CSS « #rrggbb » en nombre, comme Phaser les attend. */
export function couleurNumerique(css: string): number {
  return /^#[0-9a-f]{6}$/i.test(css) ? Number.parseInt(css.slice(1), 16) : 0x777777;
}
