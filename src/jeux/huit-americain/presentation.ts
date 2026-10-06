import { t, type CleTexte } from '../../i18n';
import { ECRAN, type Langue } from '../../noyau/contrat';
import { COULEURS, RANGS, memeCarte, type Carte, type Couleur, type Rang } from './cartes';
import { EFFETS, coupsDeLaVue, effetDe, type Coup, type Effet, type Options, type Vue } from './regles';

/**
 * Logique de présentation du Huit américain, séparée de Phaser pour être
 * testée sans affichage : cartes jouables, disposition de la main, ordre des
 * adversaires, textes de statut et des événements.
 *
 * Tout part de la seule vue du joueur (D-A2-03) : rien ici ne connaît les
 * mains adverses.
 */

/**
 * Plus petite zone tactile, en pixels de la scène (600 de large) : 81 px
 * font un peu plus de 44 px une fois l'écran mis à l'échelle d'un téléphone
 * de 360 px de large (328 px de scène, marges comprises) (D-C-04).
 */
export const TACTILE_MIN = 81;

/** Taille d'une carte de la main, en pixels de la scène. */
export const CARTE_MAIN = { largeur: 94, hauteur: 136 } as const;

/** Bande de l'écran réservée à la main du joueur. */
export const ZONE_MAIN = { haut: 484, bas: ECRAN.hauteur - 4, marge: 8 } as const;

/** Cartes par rangée au plus, et par page quand la main déborde. */
const PAR_RANGEE_LARGE = 6;
const PAR_RANGEE_SERREE = 7;
const PAR_PAGE = 2 * PAR_RANGEE_LARGE;
const ECART = 8;

/** Une carte de la main telle que l'écran la montre. */
export interface CarteMain {
  carte: Carte;
  /** Position dans la main (triée par les règles). */
  index: number;
  /** Coups « poser » permis avec cette carte : un seul, ou un par couleur pour un joker. */
  coups: Coup[];
  jouable: boolean;
  /** Carte qu'il vient de piocher. */
  piochee: boolean;
}

/** La main du joueur, avec les cartes qu'il peut poser maintenant. */
export function mainAffichee(vue: Vue): CarteMain[] {
  const permis = coupsDeLaVue(vue);
  const indexPiochee = vue.piochee ? vue.main.findIndex((c) => memeCarte(c, vue.piochee as Carte)) : -1;
  return vue.main.map((carte, index) => {
    const coups = permis.filter((c) => c.type === 'poser' && memeCarte(c.carte, carte));
    return { carte, index, coups, jouable: coups.length > 0, piochee: index === indexPiochee };
  });
}

/** Ce que fait le toucher d'une carte : rien, un coup, ou d'abord le choix de la couleur. */
export type ActionCarte = { type: 'rien' } | { type: 'coup'; coup: Coup } | { type: 'couleur'; coups: Coup[] };

export function actionCarte(carte: CarteMain): ActionCarte {
  if (carte.coups.length === 0) return { type: 'rien' };
  if (carte.coups.length === 1) return { type: 'coup', coup: carte.coups[0] as Coup };
  return { type: 'couleur', coups: carte.coups };
}

/** Coup « poser » de ce joker avec la couleur demandée. */
export function coupAvecCouleur(coups: readonly Coup[], couleur: Couleur): Coup | undefined {
  return coups.find((c) => c.type === 'poser' && c.couleur === couleur);
}

export function peutPiocher(vue: Vue): boolean {
  return coupsDeLaVue(vue).some((c) => c.type === 'piocher');
}

export function peutPasser(vue: Vue): boolean {
  return coupsDeLaVue(vue).some((c) => c.type === 'passer');
}

/** Vrai quand le seul coup possible est de passer : l'écran passe tout seul. */
export function passeForcee(vue: Vue): boolean {
  const coups = coupsDeLaVue(vue);
  return coups.length === 1 && coups[0]?.type === 'passer';
}

/**
 * Adversaires dans l'ordre de la table, en partant du joueur assis après
 * soi. L'ordre ne bouge pas quand le sens du jeu change : chacun garde sa place.
 */
export function ordreAdversaires(vue: Vue): number[] {
  const n = vue.nombreCartes.length;
  return Array.from({ length: n - 1 }, (_, i) => (vue.joueur + 1 + i) % n);
}

/** Position d'une carte de la main dans la scène (centre de la carte). */
export interface PlaceCarte {
  index: number;
  x: number;
  y: number;
}

export interface DispositionMain {
  page: number;
  pages: number;
  /** Écart entre deux cartes voisines : la partie visible de chaque carte. */
  pas: number;
  places: PlaceCarte[];
}

/**
 * Disposition de la main dans le bas de l'écran : une rangée jusqu'à 6
 * cartes, deux rangées jusqu'à 14 (légèrement superposées au-delà de 12),
 * puis des pages de 12 cartes. La partie visible de chaque carte reste
 * toujours d'au moins `TACTILE_MIN` pixels de large (D-C-04).
 */
export function disposerMain(nombre: number, pageVoulue = 0): DispositionMain {
  const pages = nombre > 2 * PAR_RANGEE_SERREE ? Math.ceil(nombre / PAR_PAGE) : 1;
  const page = Math.min(Math.max(0, pageVoulue), pages - 1);
  const debut = pages > 1 ? page * PAR_PAGE : 0;
  const visibles = pages > 1 ? Math.min(PAR_PAGE, nombre - debut) : nombre;

  const parRangee = visibles <= PAR_RANGEE_LARGE ? visibles : visibles <= PAR_PAGE ? Math.ceil(visibles / 2) : PAR_RANGEE_SERREE;
  const largeurDispo = ECRAN.largeur - 2 * ZONE_MAIN.marge;
  const pas = Math.min(CARTE_MAIN.largeur + ECART, parRangee > 1 ? (largeurDispo - CARTE_MAIN.largeur) / (parRangee - 1) : 0);
  const rangees = visibles > parRangee ? 2 : 1;
  const hauteurZone = ZONE_MAIN.bas - ZONE_MAIN.haut;
  const hauteurMain = rangees * CARTE_MAIN.hauteur + (rangees - 1) * 12;
  const yHaut = ZONE_MAIN.haut + (hauteurZone - hauteurMain) / 2 + CARTE_MAIN.hauteur / 2;

  const places: PlaceCarte[] = [];
  for (let k = 0; k < visibles; k++) {
    const rangee = k < parRangee ? 0 : 1;
    const dansRangee = rangee === 0 ? parRangee : visibles - parRangee;
    const position = rangee === 0 ? k : k - parRangee;
    const largeur = CARTE_MAIN.largeur + (dansRangee - 1) * pas;
    const x = (ECRAN.largeur - largeur) / 2 + CARTE_MAIN.largeur / 2 + position * pas;
    places.push({ index: debut + k, x, y: yHaut + rangee * (CARTE_MAIN.hauteur + 12) });
  }
  return { page, pages, pas: visibles > 1 ? pas : CARTE_MAIN.largeur, places };
}

/** Page de la main qui contient cette carte. */
export function pageDeCarte(nombre: number, index: number): number {
  return nombre > 2 * PAR_RANGEE_SERREE ? Math.floor(index / PAR_PAGE) : 0;
}

/** Ce qui vient de se passer, déduit de deux vues successives. */
export type Evenement =
  | { type: 'pose'; joueur: number; carte: Carte; effet: Effet; couleur: Couleur; cible: number | null; penalite: number }
  | { type: 'pioche'; joueur: number; nombre: number; penalite: boolean }
  | { type: 'passe'; joueur: number };

/**
 * Le coup joué entre deux vues. La session envoie une vue après chaque
 * coup : celui qui avait la main dans la vue d'avant vient de jouer.
 */
export function evenement(avant: Vue | null, apres: Vue): Evenement | null {
  if (!avant || avant.gagnants !== null) return null;
  const joueur = avant.courant;
  const n = apres.nombreCartes.length;
  if (apres.defausse.length > avant.defausse.length) {
    const carte = apres.dessus;
    const effet = effetDe(apres.options, carte);
    const fini = apres.gagnants !== null;
    let cible: number | null = null;
    if (!fini && effet === 'piocher2') cible = apres.courant;
    if (!fini && effet === 'sauter') cible = (((joueur + apres.sens) % n) + n) % n;
    return { type: 'pose', joueur, carte, effet: fini ? 'aucun' : effet, couleur: apres.couleur, cible, penalite: apres.penalite };
  }
  const pioche = (apres.nombreCartes[joueur] ?? 0) - (avant.nombreCartes[joueur] ?? 0);
  if (pioche > 0) return { type: 'pioche', joueur, nombre: pioche, penalite: avant.penalite > 0 };
  return { type: 'passe', joueur };
}

/** Pseudo d'un joueur, ou son numéro de place s'il n'en a pas. */
export function nomJoueur(vue: Vue, joueur: number): string {
  return vue.joueurs[joueur]?.pseudo || `${joueur + 1}`;
}

/** Valeur écrite sur la carte : valet, dame et roi suivent la langue. */
export function rangAffiche(rang: Rang, langue: Langue): string {
  return rang === 'V' || rang === 'D' || rang === 'R' ? t(`huit.rang.${rang}` as const, {}, langue) : rang;
}

export function nomCouleur(couleur: Couleur, langue: Langue): string {
  return t(`huit.couleur.${couleur}` as const, {}, langue);
}

/** Nom court d'une carte : « 8♥ », « J♠ ». */
export function libelleCarte(carte: Carte, langue: Langue, symboles: Record<Couleur, string>): string {
  return `${rangAffiche(carte.rang, langue)}${symboles[carte.couleur]}`;
}

/** Phrase qui raconte un événement, sur une ou deux lignes. */
export function texteEvenement(e: Evenement | null, vue: Vue, langue: Langue, symboles: Record<Couleur, string>): string {
  if (!e) return '';
  const nom = nomJoueur(vue, e.joueur);
  switch (e.type) {
    case 'passe':
      return t('huit.evt.passe', { nom }, langue);
    case 'pioche':
      return e.penalite || e.nombre > 1
        ? t('huit.evt.piochePenalite', { nom, n: e.nombre }, langue)
        : t('huit.evt.pioche', { nom }, langue);
    case 'pose': {
      const carte = libelleCarte(e.carte, langue, symboles);
      const lignes = [
        e.effet === 'joker'
          ? t('huit.evt.joker', { nom, carte, couleur: nomCouleur(e.couleur, langue) }, langue)
          : t('huit.evt.pose', { nom, carte }, langue),
      ];
      if (e.effet === 'piocher2' && e.cible !== null) lignes.push(t('huit.evt.piocher2', { cible: nomJoueur(vue, e.cible), n: e.penalite }, langue));
      if (e.effet === 'sauter' && e.cible !== null) lignes.push(t('huit.evt.sauter', { cible: nomJoueur(vue, e.cible) }, langue));
      if (e.effet === 'sens') lignes.push(t('huit.evt.sens', {}, langue));
      if (e.effet === 'rejouer') lignes.push(t('huit.evt.rejouer', { nom }, langue));
      return lignes.join('\n');
    }
  }
}

/** Phrase de statut : à qui de jouer, et quoi faire quand c'est à soi. */
export function texteStatut(vue: Vue, langue: Langue): string {
  const moi = vue.joueur;
  if (vue.gagnants !== null) {
    if (vue.gagnants.length === 1) {
      const g = vue.gagnants[0] as number;
      return g === moi ? t('huit.gagneMoi', {}, langue) : t('huit.gagne', { nom: nomJoueur(vue, g) }, langue);
    }
    return t('huit.egalite', { noms: vue.gagnants.map((g) => nomJoueur(vue, g)).join(', ') }, langue);
  }
  if (vue.courant !== moi) return t('huit.tour', { nom: nomJoueur(vue, vue.courant) }, langue);

  const coups = coupsDeLaVue(vue);
  const poses = coups.some((c) => c.type === 'poser');
  let cle: CleTexte;
  if (vue.penalite > 0) cle = poses ? 'huit.penaliteContre' : 'huit.penalite';
  else if (vue.piochee) cle = poses ? 'huit.piochee' : 'huit.piocheeInjouable';
  else if (poses) cle = 'huit.aToi';
  else cle = coups.some((c) => c.type === 'piocher') ? 'huit.aToiPiocher' : 'huit.bloque';
  return t(cle, { n: vue.penalite }, langue);
}

/** Cartes spéciales de la partie, regroupées par effet, pour l'aide et les pastilles. */
export function cartesSpeciales(options: Options): { effet: Exclude<Effet, 'aucun'>; rangs: Rang[] }[] {
  return EFFETS.filter((e): e is Exclude<Effet, 'aucun'> => e !== 'aucun')
    .map((effet) => ({ effet, rangs: RANGS.filter((r) => options.effets[r] === effet) }))
    .filter((groupe) => groupe.rangs.length > 0);
}

/** Les quatre couleurs proposées après un joker, dans l'ordre habituel. */
export const CHOIX_COULEURS: readonly Couleur[] = COULEURS;
