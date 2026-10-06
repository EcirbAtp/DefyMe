/**
 * Contrat de jeu commun (D-A1-02).
 *
 * Chaque jeu de DefyMe est un module qui fournit un objet `Jeu`. Le noyau
 * (menus, session de partie, réseau) ne connaît que ce contrat et aucune
 * règle de jeu (D-A1-10).
 *
 * Trois règles s'imposent à tout jeu :
 * - Règles pures (D-A1-03) : `etatInitial`, `joueurCourant`, `coupsPermis`,
 *   `jouer`, `estFini`, `vuePour` et `ordinateur` ne modifient jamais leurs
 *   arguments, n'affichent rien et ne touchent pas au réseau. Même entrée,
 *   même sortie.
 * - État sérialisable : l'état, les coups, les vues et les options doivent
 *   survivre à `JSON.parse(JSON.stringify(x))` sans changer. Ils partent sur
 *   le réseau et sont sauvegardés sur le téléphone.
 * - Hasard par graine (D-A1-07) : tout hasard vient de la graine reçue par
 *   `etatInitial` (ou par `ordinateur`), via la classe `Hasard`. Jamais de
 *   `Math.random()` ni de `Date.now()` dans les règles.
 *
 * `verifierJeu` (fichier verification.ts) contrôle automatiquement ces règles.
 */

/** Nombre maximal de joueurs dans une partie, humains et ordinateurs compris (D-A2-01). */
export const MAX_JOUEURS = 8;

/** Temps de réflexion maximal de l'ordinateur par défaut, en millisecondes (D-A2-09). */
export const TEMPS_REFLEXION_PAR_DEFAUT_MS = 1000;

/** Langues de l'appli (DC-7). */
export const LANGUES = ['fr', 'en'] as const;
export type Langue = (typeof LANGUES)[number];

/** Un texte fourni dans toutes les langues de l'appli. */
export type TexteTraduit = Record<Langue, string>;

/** Graine du hasard : entier non signé sur 32 bits (D-A1-07). */
export type Graine = number;

/** Niveaux de difficulté de l'ordinateur : 1 facile à 5 difficile (D-A2-09). */
export const NIVEAUX_ORDINATEUR = [1, 2, 3, 4, 5] as const;
export type NiveauOrdinateur = (typeof NIVEAUX_ORDINATEUR)[number];

/**
 * Un joueur tel que le jeu le voit. Le jeu désigne les joueurs par leur
 * place (index dans la liste reçue par `etatInitial`), de 0 à n-1.
 * Le jeu ne sait pas si une place est tenue par un humain ou un ordinateur.
 */
export interface Joueur {
  pseudo: string;
  /** Couleur choisie dans les paramètres, au format CSS « #rrggbb ». */
  couleur: string;
}

/** La fiche du jeu, affichée dans le menu Jeux (D-A1-04). */
export interface FicheJeu {
  /** Identifiant stable, en minuscules et tirets : « petits-chevaux ». */
  id: string;
  /**
   * Version des règles et du format de l'état. À augmenter à chaque
   * changement incompatible : elle est comparée à l'entrée d'un salon (D-A1-08).
   */
  version: number;
  nom: TexteTraduit;
  description: TexteTraduit;
  /** Icône courte affichée dans le menu (un emoji en attendant les packs de thème). */
  icone: string;
  joueursMin: number;
  joueursMax: number;
  /** Plafond du temps de réflexion de l'ordinateur pour ce jeu (D-A2-09). */
  tempsReflexionMaxMs?: number;
}

/** Fin de partie, renvoyée par `estFini`. */
export interface Fin {
  /** Places des gagnants. Vide en cas de match nul. */
  gagnants: number[];
}

/** Ce que l'ordinateur reçoit pour réfléchir. */
export interface Reflexion {
  /** Niveau de difficulté demandé (D-A2-09). */
  niveau: NiveauOrdinateur;
  /** Temps maximal pour choisir le coup, en millisecondes (D-A2-09). */
  tempsMaxMs: number;
  /** Graine pour le hasard de l'ordinateur : même graine, même coup (D-A1-07). */
  graine: Graine;
}

/** Données passées à l'écran du jeu au démarrage de sa scène. */
export interface DonneesEcran<Vue, Coup> {
  /** Place du joueur qui tient ce téléphone. */
  joueur: number;
  langue: Langue;
  /** Vue actuelle du joueur. */
  vue(): Vue;
  /** Appelé à chaque nouvelle vue. Renvoie une fonction pour se désabonner. */
  surNouvelleVue(rappel: (vue: Vue) => void): () => void;
  /** Envoie le coup choisi par le joueur ; la session le valide (D-A2-02). */
  proposerCoup(coup: Coup): void;
}

/**
 * Constructeur d'une scène Phaser. Le type reste abstrait ici pour que les
 * règles n'importent jamais Phaser : seul l'écran le charge, à la demande,
 * ce qui garde le premier chargement léger (D-C-07).
 */
export type ConstructeurScene = abstract new (...args: never[]) => object;

/**
 * Le contrat qu'implémente chaque jeu.
 *
 * @typeParam Etat    état complet de la partie (connu du seul hôte).
 * @typeParam Coup    un coup possible.
 * @typeParam Vue     ce qu'un joueur a le droit de voir (D-A2-03).
 * @typeParam Options variantes de règles choisies avant la partie.
 */
export interface Jeu<Etat, Coup, Vue = Etat, Options = Record<string, never>> {
  fiche: FicheJeu;

  /** Options utilisées quand le joueur ne change rien. */
  optionsParDefaut: Options;

  /** Prépare la partie à partir des joueurs (dans l'ordre des places) et d'une graine. */
  etatInitial(joueurs: readonly Joueur[], graine: Graine, options: Options): Etat;

  /** Place du joueur qui doit jouer. Sans objet une fois la partie finie. */
  joueurCourant(etat: Etat): number;

  /**
   * Coups que ce joueur peut jouer maintenant. Liste vide si ce n'est pas
   * son tour ou si la partie est finie ; jamais vide pour le joueur courant
   * d'une partie en cours (un « passer » est un coup comme un autre).
   */
  coupsPermis(etat: Etat, joueur: number): Coup[];

  /** Applique un coup permis et renvoie le nouvel état, sans modifier l'ancien. */
  jouer(etat: Etat, joueur: number, coup: Coup): Etat;

  /** `null` tant que la partie continue, sinon le résultat. */
  estFini(etat: Etat): Fin | null;

  /** Ce que ce joueur a le droit de voir : les mains adverses sont cachées (D-A2-03). */
  vuePour(etat: Etat, joueur: number): Vue;

  /** Coup choisi par l'ordinateur parmi `coupsPermis` (D-A2-08), selon le niveau (D-A2-09). */
  ordinateur(etat: Etat, joueur: number, reflexion: Reflexion): Coup;

  /** Charge la scène Phaser du jeu, à la demande. */
  ecran(): Promise<ConstructeurScene>;
}

/** Un jeu quelconque, tel que le registre et la session le manipulent. */
export type JeuQuelconque = Jeu<any, any, any, any>;
