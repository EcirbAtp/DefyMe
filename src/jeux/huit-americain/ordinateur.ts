import type { NiveauOrdinateur, Reflexion } from '../../noyau/contrat';
import { Hasard } from '../../noyau/hasard';
import { comparerCartes, memeCarte, paquet, type Carte, type Couleur } from './cartes';
import { coupsPermis, effetDe, estFini, jouer, nombreDeJeux, vuePour, type Coup, type Etat, type Vue } from './regles';

/**
 * L'ordinateur du Huit américain (D-A2-08, D-A2-09).
 *
 * Il ne joue qu'à partir de la vue du joueur qu'il remplace : sa main, la
 * défausse et ce que tout le monde a vu. Il ne triche donc jamais sur les
 * mains adverses (D-A2-03).
 *
 * La stratégie : garder ses jokers, rester dans la couleur où il a le plus
 * de cartes, attaquer le joueur suivant quand il lui reste peu de cartes,
 * demander une couleur que le suivant n'a pas. Le niveau moyen la suit un
 * coup sur deux et joue au hasard sinon ; le facile joue presque toujours
 * le pire coup ; le difficile simule la suite de la partie.
 *
 * Taux de victoire mesurés en tête-à-tête contre le niveau moyen : facile
 * environ 40 %, difficile environ 69 %. Le hasard de la donne et de la
 * pioche empêche d'atteindre les 20 % et 90 % visés au départ (D-A2-09).
 */

/**
 * Façon de jouer de chaque niveau : part des coups joués à l'envers de la
 * stratégie (le pire coup), part joués au hasard, le reste avec la
 * stratégie ; le niveau difficile simule en plus la suite de la partie.
 * Réglée par simulation (voir les tests).
 */
export interface Profil {
  maladresse: number;
  hasard: number;
  simulation: boolean;
}
export const PROFILS: Record<1 | 2 | 3, Profil> = {
  1: { maladresse: 0.9, hasard: 0.1, simulation: false },
  2: { maladresse: 0, hasard: 0.5, simulation: false },
  3: { maladresse: 0, hasard: 0, simulation: true },
};

/** Ramène un niveau du contrat aux trois niveaux de ce jeu : facile, moyen, difficile. */
export function niveauDuJeu(niveau: NiveauOrdinateur): 1 | 2 | 3 {
  return Math.min(Math.max(niveau, 1), 3) as 1 | 2 | 3;
}

export function choisirCoup(vue: Vue, permis: readonly Coup[], reflexion: Reflexion): Coup {
  const h = new Hasard(reflexion.graine);
  if (permis.length === 1) return permis[0] as Coup;
  const profil = PROFILS[niveauDuJeu(reflexion.niveau)];
  const tirage = h.suivant();
  if (tirage < profil.maladresse) return heuristique(vue, permis, h, -1);
  if (tirage < profil.maladresse + profil.hasard) return h.choisir(permis);
  if (profil.simulation) return parSimulation(vue, permis, h);
  return heuristique(vue, permis, h);
}

/**
 * Le coup que la stratégie note le mieux (égalités départagées au hasard),
 * ou le moins bien avec `signe` à -1.
 */
function heuristique(vue: Vue, permis: readonly Coup[], h: Hasard, signe: 1 | -1 = 1): Coup {
  let meilleurs: Coup[] = [];
  let meilleurScore = -Infinity;
  for (const coup of permis) {
    const s = signe * score(vue, coup);
    if (s > meilleurScore) {
      meilleurScore = s;
      meilleurs = [coup];
    } else if (s === meilleurScore) {
      meilleurs.push(coup);
    }
  }
  return h.choisir(meilleurs);
}

function score(vue: Vue, coup: Coup): number {
  if (coup.type === 'piocher') return -100;
  if (coup.type === 'passer') return -5;

  const { carte } = coup;
  const reste = sans(vue.main, carte);
  if (reste.length === 0) return 1000;

  const effet = effetDe(vue.options, carte);
  const couleur: Couleur = coup.couleur ?? carte.couleur;
  const ordinaires = reste.filter((c) => effetDe(vue.options, c) !== 'joker');
  let s = 0;

  // Garder ses jokers pour quand on est bloqué, et rester là où on a des cartes.
  if (effet === 'joker') s -= ordinaires.length > 0 ? 30 : 2;
  s += 3 * ordinaires.filter((c) => c.couleur === couleur).length;
  if (effet !== 'joker') s += ordinaires.filter((c) => c.rang === carte.rang).length;

  const n = vue.nombreCartes.length;
  const apres = (sens: 1 | -1, pas: number) => (((vue.joueur + sens * pas) % n) + n) % n;
  const prochain = apres(vue.sens, 1);
  const cartesProchain = vue.nombreCartes[prochain] ?? 0;
  const danger = cartesProchain <= 2 ? 1 : 0;

  switch (effet) {
    case 'piocher2':
      s += 8 + 15 * danger;
      break;
    case 'sauter':
      s += 6 + 10 * danger;
      break;
    case 'rejouer':
      s += 6;
      break;
    case 'sens': {
      // Mieux vaut donner la main à celui qui a le plus de cartes.
      const autre = vue.nombreCartes[apres(vue.sens === 1 ? -1 : 1, 1)] ?? 0;
      s += 2 * (autre - cartesProchain);
      break;
    }
  }

  // Le suivant a déjà dû piocher faute de cette couleur : on la lui redemande.
  const cible = effet === 'sauter' ? apres(vue.sens, 2) : effet === 'sens' ? apres(vue.sens === 1 ? -1 : 1, 1) : prochain;
  if (vue.manques[cible]?.includes(couleur)) s += 6;
  return s;
}

function sans(main: readonly Carte[], carte: Carte): Carte[] {
  const reste = [...main];
  const i = reste.findIndex((c) => memeCarte(c, carte));
  if (i >= 0) reste.splice(i, 1);
  return reste;
}

/**
 * Répartitions imaginées par décision au niveau difficile : 100 à deux
 * joueurs, moins quand les parties simulées s'allongent avec le nombre de
 * joueurs, pour rester bien sous le temps de réflexion plafonné.
 */
export function simulations(joueurs: number): number {
  return Math.min(100, Math.max(25, Math.round(200 / joueurs)));
}

/** Au-delà, une partie simulée s'arrête et se juge au nombre de cartes. */
const COUPS_MAX_SIMULATION = 150;

/**
 * Niveau difficile : pour chaque coup permis, imagine plusieurs répartitions
 * possibles des cartes qu'il ne voit pas, joue la suite avec la stratégie, et
 * garde le coup qui gagne le plus souvent. Les répartitions ne tirent que
 * parmi les cartes invisibles pour lui : il ne triche pas.
 */
function parSimulation(vue: Vue, permis: readonly Coup[], h: Hasard): Coup {
  const gains = permis.map(() => 0);
  for (let d = 0, fin = simulations(vue.nombreCartes.length); d < fin; d++) {
    const monde = imaginer(vue, h);
    const graine = h.graine();
    permis.forEach((coup, i) => {
      gains[i] = (gains[i] as number) + derouler(jouer(monde, vue.joueur, coup), vue.joueur, new Hasard(graine));
    });
  }
  const max = Math.max(...gains);
  return h.choisir(permis.filter((_, i) => gains[i] === max));
}

/** Un état complet compatible avec ce que voit le joueur. */
function imaginer(vue: Vue, h: Hasard): Etat {
  const n = vue.nombreCartes.length;
  let inconnues = paquet(nombreDeJeux(n, vue.options.cartesParMain));
  for (const connue of [...vue.main, ...vue.defausse]) inconnues = sans(inconnues, connue);
  inconnues = h.melanger(inconnues);
  const mains = vue.nombreCartes.map((nombre, j) => {
    if (j === vue.joueur) return [...vue.main];
    // On donne d'abord des cartes des couleurs qu'il n'a pas montré manquer.
    const manques = vue.manques[j] ?? [];
    const main: Carte[] = [];
    for (const passe of [0, 1]) {
      for (let k = 0; k < inconnues.length && main.length < nombre; ) {
        const c = inconnues[k] as Carte;
        if (passe === 1 || !manques.includes(c.couleur)) {
          main.push(c);
          inconnues.splice(k, 1);
        } else k++;
      }
    }
    return main.sort(comparerCartes);
  });
  return {
    options: vue.options,
    joueurs: vue.joueurs,
    mains,
    pioche: inconnues,
    defausse: vue.defausse,
    couleur: vue.couleur,
    courant: vue.courant,
    sens: vue.sens,
    penalite: vue.penalite,
    piochee: vue.piochee,
    blocages: 0,
    manques: vue.manques,
    gagnants: null,
    hasard: h.graine(),
  };
}

/** Joue la suite avec la stratégie ; renvoie la part de victoire du joueur. */
function derouler(etat: Etat, joueur: number, h: Hasard): number {
  let e = etat;
  for (let i = 0; i < COUPS_MAX_SIMULATION; i++) {
    const fin = estFini(e);
    if (fin) return fin.gagnants.includes(joueur) ? 1 / fin.gagnants.length : 0;
    const j = e.courant;
    const permis = coupsPermis(e, j);
    e = jouer(e, j, permis.length === 1 ? (permis[0] as Coup) : heuristique(vuePour(e, j), permis, h));
  }
  const moins = Math.min(...e.mains.map((m) => m.length));
  return (e.mains[joueur]?.length ?? 0) === moins ? 0.5 : 0;
}
