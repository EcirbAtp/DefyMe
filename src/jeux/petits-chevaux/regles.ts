import type { Fin, Graine, Joueur } from '../../noyau/contrat';
import { Hasard } from '../../noyau/hasard';
import { ARRIVEE, CENTRE, CHEVAUX, ECURIE, LONGUEUR_PARCOURS, cotesPour, indexParcours } from './plateau';

/**
 * Règles des Petits chevaux (D-C-01), en fonctions pures (D-A1-03).
 *
 * Règles par défaut, les plus courantes en France :
 * - un 6 sort un cheval de l'écurie sur sa case de départ ;
 * - un 6 fait rejouer ;
 * - un cheval qui tombe sur un cheval adverse le renvoie à l'écurie ;
 *   deux chevaux de la même couleur ne partagent jamais une case ;
 * - il faut tomber pile sur la case au pied de son escalier ; avec trop de
 *   points, le cheval recule d'autant ;
 * - on monte l'escalier marche par marche avec le chiffre exact de la marche
 *   suivante (1, puis 2… puis 6), et un 6 depuis la marche 6 mène au centre ;
 * - le premier qui amène ses 4 chevaux au centre gagne.
 *
 * Chaque tour se joue en deux coups : lancer le dé, puis avancer un cheval
 * (ou passer si aucun ne peut bouger). Le dé vient de la graine (D-A1-07).
 */

export interface Options {
  /** Un 6 fait rejouer. */
  rejouerSur6: boolean;
  /** Trop de points pour arriver pile : le cheval recule, ou ne peut pas bouger. */
  surplus: 'recule' | 'bloque';
  /** Escalier : chiffre exact de chaque marche, ou montée libre (arrivée au centre pile). */
  escalier: 'chiffres' | 'libre';
  /** Un cheval peut passer par-dessus les autres chevaux. */
  depassement: boolean;
  /** Il faut amener tous ses chevaux au centre, ou un seul suffit (partie courte). */
  victoire: 'tous' | 'premier';
}

export const OPTIONS_PAR_DEFAUT: Options = {
  rejouerSur6: true,
  surplus: 'recule',
  escalier: 'chiffres',
  depassement: true,
  victoire: 'tous',
};

export type Coup = { type: 'lancer' } | { type: 'avancer'; cheval: number } | { type: 'passer' };

/** Le dernier coup joué, pour que l'écran l'anime et l'explique. */
export type Evenement =
  | { type: 'lancer'; joueur: number; de: number }
  | { type: 'avancer'; joueur: number; cheval: number; de: number; depuis: number; vers: number; prise: Prise | null }
  | { type: 'passer'; joueur: number; de: number };

export interface Prise {
  joueur: number;
  cheval: number;
}

export interface Etat {
  options: Options;
  /** Côté du plateau de chaque joueur (voir `COTES`). */
  cotes: number[];
  /** Progression de chaque cheval, par joueur (voir plateau.ts). */
  chevaux: number[][];
  courant: number;
  /** Dé lancé par le joueur courant, en attente de son déplacement ; `null` avant le lancer. */
  de: number | null;
  /** Suite du hasard pour les prochains dés. */
  hasard: Graine;
  gagnant: number | null;
  dernier: Evenement | null;
}

/** Ce qu'un joueur voit : tout, sauf la suite du hasard qui dévoilerait les prochains dés. */
export type Vue = Omit<Etat, 'hasard'>;

/** Où mène un déplacement possible. */
export interface Deplacement {
  vers: number;
  prise: Prise | null;
}

export function etatInitial(joueurs: readonly Joueur[], graine: Graine, options: Options): Etat {
  const h = new Hasard(graine);
  const courant = h.entier(0, joueurs.length - 1);
  return {
    options: { ...options },
    cotes: cotesPour(joueurs.length),
    chevaux: joueurs.map(() => Array.from({ length: CHEVAUX }, () => ECURIE)),
    courant,
    de: null,
    hasard: h.etat,
    gagnant: null,
    dernier: null,
  };
}

export function coupsPermis(etat: Etat, joueur: number): Coup[] {
  if (etat.gagnant !== null || joueur !== etat.courant) return [];
  if (etat.de === null) return [{ type: 'lancer' }];
  const coups: Coup[] = [];
  for (let cheval = 0; cheval < CHEVAUX; cheval++) {
    if (deplacement(etat, joueur, cheval, etat.de)) coups.push({ type: 'avancer', cheval });
  }
  return coups.length > 0 ? coups : [{ type: 'passer' }];
}

export function jouer(etat: Etat, joueur: number, coup: Coup): Etat {
  if (coup.type === 'lancer') {
    const h = new Hasard(etat.hasard);
    const de = h.de(6);
    return { ...etat, de, hasard: h.etat, dernier: { type: 'lancer', joueur, de } };
  }
  const de = etat.de as number;
  const suivant = de === 6 && etat.options.rejouerSur6 ? joueur : (joueur + 1) % etat.chevaux.length;
  if (coup.type === 'passer') {
    return { ...etat, de: null, courant: suivant, dernier: { type: 'passer', joueur, de } };
  }

  const d = deplacement(etat, joueur, coup.cheval, de);
  if (!d) throw new Error(`Cheval ${coup.cheval} immobile avec un ${de}`);
  const chevaux = etat.chevaux.map((liste) => [...liste]);
  const depuis = chevaux[joueur]![coup.cheval]!;
  chevaux[joueur]![coup.cheval] = d.vers;
  if (d.prise) chevaux[d.prise.joueur]![d.prise.cheval] = ECURIE;

  const mesChevaux = chevaux[joueur]!;
  const gagne = etat.options.victoire === 'tous' ? mesChevaux.every((p) => p === CENTRE) : mesChevaux.includes(CENTRE);
  return {
    ...etat,
    chevaux,
    de: null,
    courant: gagne ? joueur : suivant,
    gagnant: gagne ? joueur : null,
    dernier: { type: 'avancer', joueur, cheval: coup.cheval, de, depuis, vers: d.vers, prise: d.prise },
  };
}

export function estFini(etat: Etat): Fin | null {
  return etat.gagnant === null ? null : { gagnants: [etat.gagnant] };
}

export function vuePour(etat: Etat): Vue {
  const { hasard: _cache, ...vue } = etat;
  return vue;
}

/** Index dans le parcours de la case d'un cheval, ou `null` s'il n'est pas sur le parcours. */
export function caseParcours(etat: Pick<Etat, 'cotes'>, joueur: number, progression: number): number | null {
  if (progression < 0 || progression > ARRIVEE) return null;
  return indexParcours(etat.cotes[joueur]!, progression);
}

/** Le cheval posé sur cette case du parcours, s'il y en a un, sans compter le cheval `sauf`. */
export function chevalSurCase(etat: Pick<Etat, 'cotes' | 'chevaux'>, index: number, sauf?: Prise): Prise | null {
  for (let joueur = 0; joueur < etat.chevaux.length; joueur++) {
    const liste = etat.chevaux[joueur]!;
    for (let cheval = 0; cheval < liste.length; cheval++) {
      if (sauf && sauf.joueur === joueur && sauf.cheval === cheval) continue;
      if (caseParcours(etat, joueur, liste[cheval]!) === index) return { joueur, cheval };
    }
  }
  return null;
}

/**
 * Où va ce cheval avec ce dé, ou `null` s'il ne peut pas bouger.
 * Fonction pure, utilisée par les règles, l'ordinateur et l'écran.
 */
export function deplacement(
  etat: Pick<Etat, 'cotes' | 'chevaux' | 'options'>,
  joueur: number,
  cheval: number,
  de: number,
): Deplacement | null {
  const mes = etat.chevaux[joueur];
  const p = mes?.[cheval];
  if (mes === undefined || p === undefined) return null;
  const { options } = etat;
  const moi: Prise = { joueur, cheval };

  // Sortie de l'écurie.
  if (p === ECURIE) {
    if (de !== 6) return null;
    return arriverSurParcours(etat, moi, 0);
  }

  // Sur le parcours, avant la case d'arrivée.
  if (p < ARRIVEE) {
    let vers = p + de;
    if (vers > ARRIVEE) {
      if (options.surplus === 'bloque') return null;
      vers = 2 * ARRIVEE - vers;
    }
    if (!options.depassement) {
      for (let pas = 1; pas < de; pas++) {
        const q = p + pas <= ARRIVEE ? p + pas : 2 * ARRIVEE - (p + pas);
        if (chevalSurCase(etat, indexParcours(etat.cotes[joueur]!, q), moi)) return null;
      }
    }
    return arriverSurParcours(etat, moi, vers);
  }

  // Au pied de l'escalier ou dans l'escalier.
  if (p >= CENTRE) return null;
  let vers: number;
  if (options.escalier === 'chiffres') {
    const marche = p - ARRIVEE; // 0 au pied, 1 à 6 dans l'escalier
    if (de !== Math.min(marche + 1, 6)) return null;
    vers = p + 1;
  } else {
    vers = p + de;
    if (vers > CENTRE) return null;
  }
  if (vers < CENTRE && mes.includes(vers)) return null;
  return { vers, prise: null };
}

/** Arrivée sur une case du parcours : bloquée par son propre cheval, prise d'un cheval adverse. */
function arriverSurParcours(etat: Pick<Etat, 'cotes' | 'chevaux'>, moi: Prise, vers: number): Deplacement | null {
  const occupant = chevalSurCase(etat, indexParcours(etat.cotes[moi.joueur]!, vers), moi);
  if (occupant?.joueur === moi.joueur) return null;
  return { vers, prise: occupant };
}

/** Distance, dans le sens du jeu, d'une case du parcours à une autre (0 à 51). */
export function distanceParcours(de: number, vers: number): number {
  return (((vers - de) % LONGUEUR_PARCOURS) + LONGUEUR_PARCOURS) % LONGUEUR_PARCOURS;
}
