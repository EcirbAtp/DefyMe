/**
 * Géométrie du plateau des Petits chevaux : une croix dans une grille de
 * 15 × 15 cases. Dessin original, sans reprendre de plateau du commerce (D-B-03).
 *
 * - Le parcours fait le tour de la croix : 52 cases, dans le sens des
 *   aiguilles d'une montre.
 * - Chaque couleur a sa case de départ, puis une case d'arrivée au pied de
 *   son escalier (6 marches) qui mène au centre.
 * - Les écuries sont dans les coins : celle de chaque couleur est juste avant
 *   sa case de départ.
 *
 * La progression d'un cheval est un seul nombre (voir `ECURIE` à `CENTRE`),
 * ce qui garde l'état simple et sérialisable. Ce fichier ne dépend de rien :
 * les règles et l'écran s'en servent tous les deux.
 */

export type Case = readonly [ligne: number, colonne: number];

/** Taille de la grille. */
export const TAILLE = 15;

/** Nombre de cases du parcours. */
export const LONGUEUR_PARCOURS = 52;

/** Cases parcourues entre la case de départ et la case d'arrivée (au pied de l'escalier). */
export const ARRIVEE = 50;

/** Progression d'un cheval encore à l'écurie. */
export const ECURIE = -1;

/** Marches de l'escalier : progression `ARRIVEE + 1` à `ARRIVEE + MARCHES`. */
export const MARCHES = 6;

/** Progression d'un cheval arrivé au centre. */
export const CENTRE = ARRIVEE + MARCHES + 1;

/** Nombre de chevaux par joueur. */
export const CHEVAUX = 4;

/** Les 52 cases du parcours, dans le sens des aiguilles d'une montre. */
export const PARCOURS: readonly Case[] = construireParcours();

/**
 * Les 4 côtés du plateau, dans l'ordre du jeu (haut, droite, bas, gauche).
 * `arrivee` est l'index dans `PARCOURS` de la case au pied de l'escalier,
 * `depart` celui de la case de sortie de l'écurie.
 */
export interface Cote {
  depart: number;
  arrivee: number;
  escalier: readonly Case[];
  ecurie: readonly Case[];
}

export const COTES: readonly Cote[] = [
  cote([0, 7], [1, 0], [1.5, 10.5]),
  cote([7, 14], [0, -1], [10.5, 10.5]),
  cote([14, 7], [-1, 0], [10.5, 1.5]),
  cote([7, 0], [0, 1], [1.5, 1.5]),
];

/**
 * Côtés occupés selon le nombre de joueurs : à 2, les joueurs se font face ;
 * à 3, le côté gauche reste libre.
 */
export function cotesPour(nombreDeJoueurs: number): number[] {
  if (nombreDeJoueurs === 2) return [0, 2];
  return [0, 1, 2, 3].slice(0, nombreDeJoueurs);
}

/** Index dans `PARCOURS` d'une progression sur le parcours (0 à `ARRIVEE`) pour un côté. */
export function indexParcours(cote: number, progression: number): number {
  return ((COTES[cote] as Cote).depart + progression) % LONGUEUR_PARCOURS;
}

/** Case de la grille où se trouve un cheval. `numero` place les chevaux de l'écurie et du centre. */
export function caseDuCheval(cote: number, progression: number, numero: number): Case {
  const c = COTES[cote] as Cote;
  if (progression === ECURIE) return c.ecurie[numero] as Case;
  if (progression <= ARRIVEE) return PARCOURS[indexParcours(cote, progression)] as Case;
  if (progression < CENTRE) return c.escalier[progression - ARRIVEE - 1] as Case;
  return [7, 7];
}

function construireParcours(): Case[] {
  const cases: Case[] = [];
  const ajouter = (de: Case, vers: Case): void => {
    const [l1, c1] = de;
    const [l2, c2] = vers;
    const n = Math.max(Math.abs(l2 - l1), Math.abs(c2 - c1));
    for (let i = 0; i <= n; i++) {
      cases.push([l1 + Math.sign(l2 - l1) * i, c1 + Math.sign(c2 - c1) * i]);
    }
  };
  ajouter([6, 1], [6, 5]);
  ajouter([5, 6], [0, 6]);
  ajouter([0, 7], [0, 8]);
  ajouter([1, 8], [5, 8]);
  ajouter([6, 9], [6, 14]);
  ajouter([7, 14], [8, 14]);
  ajouter([8, 13], [8, 9]);
  ajouter([9, 8], [14, 8]);
  ajouter([14, 7], [14, 6]);
  ajouter([13, 6], [9, 6]);
  ajouter([8, 5], [8, 0]);
  ajouter([7, 0], [6, 0]);
  return cases;
}

/**
 * Un côté du plateau. `pied` est la case d'arrivée, `vers` la direction de
 * l'escalier vers le centre, `coinEcurie` la place du premier cheval dans
 * l'écurie (coin de 6 × 6 cases ; les places tombent entre deux cases).
 */
function cote(pied: Case, vers: Case, coinEcurie: Case): Cote {
  const arrivee = PARCOURS.findIndex(([l, c]) => l === pied[0] && c === pied[1]);
  const escalier: Case[] = [];
  for (let i = 1; i <= MARCHES; i++) escalier.push([pied[0] + vers[0] * i, pied[1] + vers[1] * i]);
  const [l, c] = coinEcurie;
  return {
    arrivee,
    depart: (arrivee + 2) % LONGUEUR_PARCOURS,
    escalier,
    ecurie: [
      [l, c],
      [l, c + 2],
      [l + 2, c],
      [l + 2, c + 2],
    ],
  };
}
