import type { Fin, Graine, Joueur } from '../../noyau/contrat';
import { Hasard } from '../../noyau/hasard';
import { COULEURS, RANGS, comparerCartes, memeCarte, paquet, type Carte, type Couleur, type Rang } from './cartes';

/**
 * Règles du Huit américain (D-C-02) : 2 à 8 joueurs, mains cachées.
 *
 * On pose une carte de la même couleur ou de la même valeur que la carte du
 * dessus de la défausse. Sans carte jouable, on pioche une carte et on la
 * pose si elle va, sinon on passe. Le premier qui n'a plus de cartes gagne.
 *
 * Les effets des cartes spéciales sont des options : chaque valeur peut
 * recevoir n'importe quel effet avant la partie.
 */

/** Ce que fait une carte une fois posée. */
export const EFFETS = ['aucun', 'joker', 'piocher2', 'sauter', 'sens', 'rejouer'] as const;
export type Effet = (typeof EFFETS)[number];
// joker    : se pose sur n'importe quelle carte et fixe la couleur demandée ;
// piocher2 : le suivant pioche 2 cartes (cumulable si l'option est active) ;
// sauter   : le suivant passe son tour ;
// sens     : le sens du jeu s'inverse ;
// rejouer  : le même joueur rejoue.

export interface Options {
  /** Effet de chaque valeur de carte. */
  effets: Record<Rang, Effet>;
  /** Cartes distribuées à chaque joueur (3 à 10). */
  cartesParMain: number;
  /** Un « piocher 2 » peut se contrer par un autre, et les pénalités s'additionnent. */
  cumul: boolean;
}

export const OPTIONS_PAR_DEFAUT: Options = {
  effets: {
    A: 'sens',
    '2': 'piocher2',
    '3': 'aucun',
    '4': 'aucun',
    '5': 'aucun',
    '6': 'aucun',
    '7': 'aucun',
    '8': 'joker',
    '9': 'aucun',
    '10': 'rejouer',
    V: 'sauter',
    D: 'aucun',
    R: 'aucun',
  },
  cartesParMain: 7,
  cumul: true,
};

export interface Etat {
  options: Options;
  /** Pseudo et couleur de chaque joueur, dans l'ordre des places : information publique. */
  joueurs: Joueur[];
  /** Main de chaque joueur, triée. Cachée aux autres (D-A2-03). */
  mains: Carte[][];
  /** Pioche face cachée ; le dessus est le dernier élément. */
  pioche: Carte[];
  /** Défausse face visible ; le dessus est le dernier élément. */
  defausse: Carte[];
  /** Couleur à suivre : celle du dessus, ou celle annoncée avec un joker. */
  couleur: Couleur;
  courant: number;
  sens: 1 | -1;
  /** Cartes que le joueur courant doit piocher s'il ne contre pas. */
  penalite: number;
  /** Carte que le joueur courant vient de piocher : il peut la poser ou passer. */
  piochee: Carte | null;
  /** Passages consécutifs de joueurs bloqués (plus rien à piocher). */
  blocages: number;
  /**
   * Couleurs qu'un joueur n'avait pas la dernière fois qu'il a dû piocher.
   * Information publique : tout le monde l'a vu piocher.
   */
  manques: Couleur[][];
  gagnants: number[] | null;
  /** Suite du hasard, pour remélanger la défausse (D-A1-07). */
  hasard: Graine;
}

export type Coup =
  | { type: 'poser'; carte: Carte; couleur?: Couleur }
  | { type: 'piocher' }
  | { type: 'passer' };

/** Ce qu'un joueur a le droit de voir (D-A2-03). */
export interface Vue {
  joueur: number;
  options: Options;
  /** Pseudo et couleur de chaque joueur. */
  joueurs: Joueur[];
  /** Sa propre main, et seulement la sienne. */
  main: Carte[];
  /** Nombre de cartes de chaque joueur. */
  nombreCartes: number[];
  dessus: Carte;
  /** Défausse entière, du dessous au dessus : tout le monde l'a vue passer. */
  defausse: Carte[];
  couleur: Couleur;
  courant: number;
  sens: 1 | -1;
  penalite: number;
  /** Cartes restant dans la pioche. */
  pioche: number;
  /** Carte qu'il vient de piocher, si c'est son tour. */
  piochee: Carte | null;
  manques: Couleur[][];
  gagnants: number[] | null;
}

export function effetDe(options: Options, carte: Carte): Effet {
  return options.effets[carte.rang] ?? 'aucun';
}

/** Jeux de 52 cartes nécessaires : un seul tant qu'il reste au moins 15 cartes après la donne. */
export function nombreDeJeux(joueurs: number, cartesParMain: number): number {
  return Math.ceil((joueurs * cartesParMain + 15) / 52);
}

export function etatInitial(joueurs: readonly Joueur[], graine: Graine, optionsRecues: Options): Etat {
  const options = normaliserOptions(optionsRecues);
  const n = joueurs.length;
  const h = new Hasard(graine);
  const pioche = h.melanger(paquet(nombreDeJeux(n, options.cartesParMain)));
  const mains: Carte[][] = Array.from({ length: n }, () => []);
  for (let tour = 0; tour < options.cartesParMain; tour++) {
    for (const main of mains) main.push(pioche.pop() as Carte);
  }
  for (const main of mains) main.sort(comparerCartes);

  // La première carte retournée est une carte sans effet : une carte spéciale
  // retourne sous la pioche (si toutes ont un effet, on garde la dernière tirée).
  let premiere = pioche.pop() as Carte;
  for (let essais = pioche.length; essais > 0 && effetDe(options, premiere) !== 'aucun'; essais--) {
    pioche.unshift(premiere);
    premiere = pioche.pop() as Carte;
  }

  return {
    options,
    joueurs: joueurs.map((j) => ({ pseudo: j.pseudo, couleur: j.couleur })),
    mains,
    pioche,
    defausse: [premiere],
    couleur: premiere.couleur,
    courant: h.entier(0, n - 1),
    sens: 1,
    penalite: 0,
    piochee: null,
    blocages: 0,
    manques: mains.map(() => []),
    gagnants: null,
    hasard: h.graine(),
  };
}

/** Options complétées et ramenées dans leurs bornes. */
export function normaliserOptions(options: Partial<Options>): Options {
  const effets = { ...OPTIONS_PAR_DEFAUT.effets };
  for (const rang of RANGS) {
    const effet = options.effets?.[rang];
    if (effet !== undefined && (EFFETS as readonly string[]).includes(effet)) effets[rang] = effet;
  }
  const cartes = Number.isInteger(options.cartesParMain) ? (options.cartesParMain as number) : OPTIONS_PAR_DEFAUT.cartesParMain;
  return {
    effets,
    cartesParMain: Math.min(10, Math.max(3, cartes)),
    cumul: options.cumul ?? OPTIONS_PAR_DEFAUT.cumul,
  };
}

export function dessus(etat: Etat): Carte {
  return etat.defausse[etat.defausse.length - 1] as Carte;
}

/** Ce qu'il faut savoir de la table pour connaître les coups permis : la vue d'un joueur suffit. */
type Table = Pick<Vue, 'options' | 'couleur' | 'dessus' | 'penalite' | 'piochee'>;

/** Vrai si la carte peut se poser maintenant (hors pénalité en cours). */
export function posable(etat: Etat | Table, carte: Carte): boolean {
  if (effetDe(etat.options, carte) === 'joker') return true;
  const haut = 'dessus' in etat ? etat.dessus : dessus(etat);
  return carte.couleur === etat.couleur || carte.rang === haut.rang;
}

function coupsPoser(etat: Table, cartes: readonly Carte[]): Coup[] {
  const coups: Coup[] = [];
  const vues: Carte[] = [];
  for (const carte of cartes) {
    // Avec deux jeux, deux cartes identiques donnent le même coup.
    if (vues.some((v) => memeCarte(v, carte))) continue;
    vues.push(carte);
    if (effetDe(etat.options, carte) === 'joker') {
      for (const couleur of COULEURS) coups.push({ type: 'poser', carte, couleur });
    } else {
      coups.push({ type: 'poser', carte });
    }
  }
  return coups;
}

export function coupsPermis(etat: Etat, joueur: number): Coup[] {
  return coupsDeLaVue(vuePour(etat, joueur));
}

/**
 * Coups permis calculés à partir de la seule vue du joueur : les règles et
 * l'écran (qui ne connaît que la vue) partagent ainsi le même calcul.
 */
export function coupsDeLaVue(vue: Vue): Coup[] {
  if (vue.gagnants !== null || vue.joueur !== vue.courant) return [];
  const { main } = vue;

  if (vue.penalite > 0) {
    const contres = vue.options.cumul ? main.filter((c) => effetDe(vue.options, c) === 'piocher2') : [];
    return [...coupsPoser(vue, contres), { type: 'piocher' }];
  }
  if (vue.piochee) {
    const coups = posable(vue, vue.piochee) ? coupsPoser(vue, [vue.piochee]) : [];
    return [...coups, { type: 'passer' }];
  }
  const jouables = coupsPoser(vue, main.filter((c) => posable(vue, c)));
  if (jouables.length > 0) return jouables;
  // Cartes encore disponibles à la pioche, défausse remélangée comprise.
  const aPiocher = vue.pioche + vue.defausse.length - 1;
  return [aPiocher > 0 ? { type: 'piocher' } : { type: 'passer' }];
}

/** Place du joueur suivant dans le sens du jeu, `pas` places plus loin. */
function suivant(etat: Etat, depuis: number, pas = 1): number {
  const n = etat.mains.length;
  return (((depuis + etat.sens * pas) % n) + n) % n;
}

/** Pioche jusqu'à `nombre` cartes, en remélangeant la défausse si besoin. */
function piocher(etat: Etat, joueur: number, nombre: number): { etat: Etat; tirees: Carte[] } {
  let pioche = [...etat.pioche];
  let defausse = etat.defausse;
  let hasard = etat.hasard;
  const tirees: Carte[] = [];
  for (let i = 0; i < nombre; i++) {
    if (pioche.length === 0) {
      if (defausse.length <= 1) break;
      const h = new Hasard(hasard);
      pioche = h.melanger(defausse.slice(0, -1));
      hasard = h.etat;
      defausse = defausse.slice(-1);
    }
    tirees.push(pioche.pop() as Carte);
  }
  const mains = etat.mains.map((m, j) => (j === joueur ? [...m, ...tirees].sort(comparerCartes) : m));
  return { etat: { ...etat, pioche, defausse, hasard, mains }, tirees };
}

export function jouer(etat: Etat, joueur: number, coup: Coup): Etat {
  switch (coup.type) {
    case 'poser':
      return poser(etat, joueur, coup.carte, coup.couleur);

    case 'piocher': {
      if (etat.penalite > 0) {
        const { etat: e } = piocher(etat, joueur, etat.penalite);
        return { ...e, penalite: 0, blocages: 0, courant: suivant(e, joueur) };
      }
      // Il pioche parce qu'il n'avait ni la couleur ni la valeur demandées.
      const manques = etat.manques.map((m, j) => (j === joueur ? ajouterManque(m, etat.couleur) : m));
      const { etat: e, tirees } = piocher(etat, joueur, 1);
      return { ...e, manques, blocages: 0, piochee: tirees[0] ?? null };
    }

    case 'passer': {
      // Passer sans avoir pioché : le joueur est bloqué, plus rien à piocher.
      const blocages = etat.piochee ? 0 : etat.blocages + 1;
      const e: Etat = { ...etat, piochee: null, blocages, courant: suivant(etat, joueur) };
      // Tout le monde est bloqué : la partie s'arrête, gagnée par qui a le moins de cartes.
      if (blocages >= etat.mains.length) {
        const moins = Math.min(...etat.mains.map((m) => m.length));
        return { ...e, gagnants: etat.mains.flatMap((m, j) => (m.length === moins ? [j] : [])) };
      }
      return e;
    }
  }
}

function ajouterManque(manques: Couleur[], couleur: Couleur): Couleur[] {
  return manques.includes(couleur) ? manques : [...manques, couleur].sort((a, b) => COULEURS.indexOf(a) - COULEURS.indexOf(b));
}

function poser(etat: Etat, joueur: number, carte: Carte, annoncee: Couleur | undefined): Etat {
  const main = [...(etat.mains[joueur] as Carte[])];
  main.splice(
    main.findIndex((c) => memeCarte(c, carte)),
    1,
  );
  const effet = effetDe(etat.options, carte);
  const couleur = effet === 'joker' && annoncee ? annoncee : carte.couleur;
  // Poser une couleur prouve qu'on l'avait : elle sort de ses manques connus.
  const manques = etat.manques.map((m, j) => (j === joueur ? m.filter((c) => c !== carte.couleur) : m));
  const base: Etat = {
    ...etat,
    mains: etat.mains.map((m, j) => (j === joueur ? main : m)),
    defausse: [...etat.defausse, { rang: carte.rang, couleur: carte.couleur }],
    couleur,
    piochee: null,
    blocages: 0,
    manques,
  };
  if (main.length === 0) return { ...base, gagnants: [joueur] };

  switch (effet) {
    case 'piocher2':
      return { ...base, penalite: etat.penalite + 2, courant: suivant(base, joueur) };
    case 'sauter':
      return { ...base, courant: suivant(base, joueur, 2) };
    case 'sens': {
      const inverse: Etat = { ...base, sens: base.sens === 1 ? -1 : 1 };
      return { ...inverse, courant: suivant(inverse, joueur) };
    }
    case 'rejouer':
      return base;
    default:
      return { ...base, courant: suivant(base, joueur) };
  }
}

export function estFini(etat: Etat): Fin | null {
  return etat.gagnants === null ? null : { gagnants: etat.gagnants };
}

export function vuePour(etat: Etat, joueur: number): Vue {
  return {
    joueur,
    options: etat.options,
    joueurs: etat.joueurs,
    main: etat.mains[joueur] ?? [],
    nombreCartes: etat.mains.map((m) => m.length),
    dessus: dessus(etat),
    defausse: etat.defausse,
    couleur: etat.couleur,
    courant: etat.courant,
    sens: etat.sens,
    penalite: etat.penalite,
    pioche: etat.pioche.length,
    piochee: joueur === etat.courant ? etat.piochee : null,
    manques: etat.manques,
    gagnants: etat.gagnants,
  };
}
