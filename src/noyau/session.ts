import {
  MAX_JOUEURS,
  TEMPS_REFLEXION_PAR_DEFAUT_MS,
  type Fin,
  type Graine,
  type Jeu,
  type Joueur,
  type NiveauOrdinateur,
} from './contrat';
import { Hasard, normaliserGraine, nouvelleGraine } from './hasard';
import { copieJson, memeValeur } from './serialisation';

/**
 * Session de partie : le petit moteur commun qui fait tourner n'importe quel
 * jeu à travers le contrat, sans connaître ses règles (D-A1-10).
 *
 * Elle tourne sur un seul téléphone : celui du joueur en mode « un seul
 * téléphone » (D-A2-07), ou celui de l'hôte en mode réseau, où le réseau ne
 * fera que lui apporter les coups des invités et diffuser les vues. Les
 * règles sont donc les mêmes dans les deux modes (D-A1-06).
 */

/** Qui tient une place : un humain, ou l'ordinateur à un niveau donné. */
export type Controle = { type: 'humain' } | { type: 'ordinateur'; niveau: NiveauOrdinateur };

export interface Place {
  joueur: Joueur;
  controle: Controle;
}

export interface CoupJoue<Coup> {
  joueur: number;
  coup: Coup;
}

/** Tout ce qu'il faut pour reprendre la partie plus tard (D-D-09). Sérialisable en JSON. */
export interface Sauvegarde<Etat, Coup, Options> {
  format: 1;
  jeu: { id: string; version: number };
  graine: Graine;
  options: Options;
  places: Place[];
  coups: CoupJoue<Coup>[];
  etat: Etat;
  hasardOrdinateur: Graine;
}

export type RefusCoup = 'partie-finie' | 'pas-ton-tour' | 'place-inconnue' | 'coup-interdit';
export type ResultatCoup = { ok: true } | { ok: false; raison: RefusCoup };

export interface Changement<Coup> {
  coup: CoupJoue<Coup>;
  fin: Fin | null;
}

export class SessionDePartie<Etat, Coup, Vue, Options> {
  readonly jeu: Jeu<Etat, Coup, Vue, Options>;
  readonly graine: Graine;
  readonly options: Options;
  #places: Place[];
  #etat: Etat;
  #coups: CoupJoue<Coup>[];
  #hasardOrdinateur: Graine;
  #fin: Fin | null;
  #ecouteurs = new Set<(changement: Changement<Coup>) => void>();

  private constructor(
    jeu: Jeu<Etat, Coup, Vue, Options>,
    graine: Graine,
    options: Options,
    places: Place[],
    etat: Etat,
    coups: CoupJoue<Coup>[],
    hasardOrdinateur: Graine,
  ) {
    this.jeu = jeu;
    this.graine = graine;
    this.options = options;
    this.#places = places;
    this.#etat = etat;
    this.#coups = coups;
    this.#hasardOrdinateur = hasardOrdinateur;
    this.#fin = jeu.estFini(etat);
  }

  /**
   * Lance une nouvelle partie. Refuse un nombre de joueurs que le jeu
   * n'accepte pas (D-A3-04) ou supérieur à 8 (D-A2-01).
   */
  static creer<E, C, V, O>(
    jeu: Jeu<E, C, V, O>,
    places: readonly Place[],
    reglages: { graine?: Graine; options?: O } = {},
  ): SessionDePartie<E, C, V, O> {
    verifierNombreDeJoueurs(jeu, places.length);
    const graine = normaliserGraine(reglages.graine ?? nouvelleGraine());
    const options = copieJson(reglages.options ?? jeu.optionsParDefaut);
    const copiePlaces = copieJson([...places]);
    const etat = jeu.etatInitial(
      copiePlaces.map((p) => p.joueur),
      graine,
      options,
    );
    // Suite de hasard séparée pour l'ordinateur, dérivée de la même graine.
    const hasardOrdinateur = new Hasard(graine ^ 0x9e3779b9).graine();
    return new SessionDePartie(jeu, graine, options, copiePlaces, etat, [], hasardOrdinateur);
  }

  /** Reprend une partie sauvegardée (D-A2-05, D-D-09). */
  static reprendre<E, C, V, O>(jeu: Jeu<E, C, V, O>, sauvegarde: Sauvegarde<E, C, O>): SessionDePartie<E, C, V, O> {
    if (sauvegarde.format !== 1) throw new Error(`Format de sauvegarde inconnu : ${sauvegarde.format}`);
    if (sauvegarde.jeu.id !== jeu.fiche.id) {
      throw new Error(`Sauvegarde de « ${sauvegarde.jeu.id} », pas de « ${jeu.fiche.id} »`);
    }
    if (sauvegarde.jeu.version !== jeu.fiche.version) {
      throw new Error(`Sauvegarde en version ${sauvegarde.jeu.version}, jeu en version ${jeu.fiche.version}`);
    }
    verifierNombreDeJoueurs(jeu, sauvegarde.places.length);
    const s = copieJson(sauvegarde);
    return new SessionDePartie(jeu, s.graine, s.options, s.places, s.etat, s.coups, s.hasardOrdinateur);
  }

  get places(): readonly Place[] {
    return this.#places;
  }

  /** État complet. À ne jamais envoyer tel quel à un invité : utiliser `vuePour`. */
  get etat(): Etat {
    return this.#etat;
  }

  get coups(): readonly CoupJoue<Coup>[] {
    return this.#coups;
  }

  get fin(): Fin | null {
    return this.#fin;
  }

  get joueurCourant(): number {
    return this.jeu.joueurCourant(this.#etat);
  }

  /** Ce que voit ce joueur, et rien de plus (D-A2-03). */
  vuePour(joueur: number): Vue {
    return this.jeu.vuePour(this.#etat, joueur);
  }

  coupsPermis(joueur: number): Coup[] {
    if (this.#fin || !this.#places[joueur]) return [];
    return this.jeu.coupsPermis(this.#etat, joueur);
  }

  /**
   * Joue un coup proposé par un joueur, après l'avoir validé à travers le
   * contrat (D-A2-02) : c'est le tour de ce joueur, et le coup fait partie
   * de ses coups permis. Un coup venu du réseau n'est jamais cru sur parole.
   */
  proposerCoup(joueur: number, coup: Coup): ResultatCoup {
    if (this.#fin) return { ok: false, raison: 'partie-finie' };
    if (!Number.isInteger(joueur) || !this.#places[joueur]) return { ok: false, raison: 'place-inconnue' };
    if (this.jeu.joueurCourant(this.#etat) !== joueur) return { ok: false, raison: 'pas-ton-tour' };
    const permis = this.jeu.coupsPermis(this.#etat, joueur).find((c) => memeValeur(c, coup));
    if (permis === undefined) return { ok: false, raison: 'coup-interdit' };

    this.#etat = this.jeu.jouer(this.#etat, joueur, permis);
    const coupJoue = { joueur, coup: permis };
    this.#coups.push(coupJoue);
    this.#fin = this.jeu.estFini(this.#etat);
    for (const ecouteur of this.#ecouteurs) ecouteur({ coup: coupJoue, fin: this.#fin });
    return { ok: true };
  }

  /** Vrai si la partie attend un coup de l'ordinateur. */
  get auTourDeLOrdinateur(): boolean {
    return !this.#fin && this.#places[this.joueurCourant]?.controle.type === 'ordinateur';
  }

  /**
   * Fait jouer l'ordinateur s'il a la main. L'ordinateur choisit parmi les
   * coups permis (D-A2-08), dans le temps plafonné par le jeu (D-A2-09).
   * Renvoie faux si ce n'était pas à lui de jouer.
   */
  faireJouerOrdinateur(): boolean {
    if (!this.auTourDeLOrdinateur) return false;
    const joueur = this.joueurCourant;
    const controle = this.#places[joueur]?.controle;
    if (controle?.type !== 'ordinateur') return false;

    const hasard = new Hasard(this.#hasardOrdinateur);
    const graine = hasard.graine();
    this.#hasardOrdinateur = hasard.etat;
    const coup = this.jeu.ordinateur(this.#etat, joueur, {
      niveau: controle.niveau,
      tempsMaxMs: this.jeu.fiche.tempsReflexionMaxMs ?? TEMPS_REFLEXION_PAR_DEFAUT_MS,
      graine,
    });
    const resultat = this.proposerCoup(joueur, coup);
    if (!resultat.ok) {
      throw new Error(`L'ordinateur de « ${this.jeu.fiche.id} » a proposé un coup refusé (${resultat.raison})`);
    }
    return true;
  }

  /** Fait jouer les ordinateurs jusqu'au tour d'un humain ou la fin. Renvoie le nombre de coups joués. */
  faireJouerOrdinateurs(maximum = 10_000): number {
    let n = 0;
    while (n < maximum && this.faireJouerOrdinateur()) n++;
    return n;
  }

  /**
   * Change qui tient une place : un ordinateur remplace un invité parti,
   * puis lui rend la main à son retour (D-A2-04).
   */
  changerControle(joueur: number, controle: Controle): void {
    const place = this.#places[joueur];
    if (!place) throw new RangeError(`Place inconnue : ${joueur}`);
    this.#places[joueur] = { ...place, controle: { ...controle } };
  }

  /** Prévient à chaque coup joué. Renvoie une fonction pour se désabonner. */
  ecouter(rappel: (changement: Changement<Coup>) => void): () => void {
    this.#ecouteurs.add(rappel);
    return () => this.#ecouteurs.delete(rappel);
  }

  /** Photographie de la partie, à ranger sur le téléphone après chaque coup (D-D-09). */
  sauvegarder(): Sauvegarde<Etat, Coup, Options> {
    return copieJson({
      format: 1 as const,
      jeu: { id: this.jeu.fiche.id, version: this.jeu.fiche.version },
      graine: this.graine,
      options: this.options,
      places: this.#places,
      coups: this.#coups,
      etat: this.#etat,
      hasardOrdinateur: this.#hasardOrdinateur,
    });
  }
}

/**
 * Rejoue une partie à l'identique à partir de sa graine et de ses coups
 * (D-A1-07) : pour les tests et pour reproduire un bug.
 */
export function rejouerPartie<E, C, V, O>(
  jeu: Jeu<E, C, V, O>,
  joueurs: readonly Joueur[],
  graine: Graine,
  options: O,
  coups: readonly CoupJoue<C>[],
): E {
  let etat = jeu.etatInitial(joueurs, normaliserGraine(graine), options);
  for (const { joueur, coup } of coups) etat = jeu.jouer(etat, joueur, coup);
  return etat;
}

function verifierNombreDeJoueurs(jeu: Jeu<unknown, unknown, unknown, unknown>, nombre: number): void {
  const { joueursMin, joueursMax, id } = jeu.fiche;
  if (nombre < joueursMin || nombre > Math.min(joueursMax, MAX_JOUEURS)) {
    throw new RangeError(`« ${id} » se joue de ${joueursMin} à ${joueursMax} joueurs, pas ${nombre}`);
  }
}
