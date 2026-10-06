import { MAX_JOUEURS, type FicheJeu, type Joueur, type NiveauOrdinateur } from '../noyau/contrat';
import type { Registre } from '../noyau/registre';
import type { Place } from '../noyau/session';
import type { CatalogueJeux, CodeErreurReseau, Participant } from '../reseau';

/**
 * Logique des salons, sans écran ni réseau : lien du QR code, places,
 * robots, couleurs et conditions de lancement. Elle vaut pour tout jeu du
 * registre (D-A1-05) : elle ne lit que sa fiche.
 */

/** Paramètre d'adresse qui porte le code du salon : « …/DefyMe/?salon=K7Q2 ». */
export const PARAMETRE_SALON = 'salon';

const FORMAT_CODE = /^[A-Z0-9]{4}$/;

/** Code nettoyé (majuscules, sans espaces), ou `null` s'il n'a pas 4 caractères valides. */
export function normaliserCode(brut: string | null | undefined): string | null {
  const code = (brut ?? '').replace(/\s+/g, '').toUpperCase();
  return FORMAT_CODE.test(code) ? code : null;
}

/**
 * Adresse à mettre dans le QR code (D-A3-01) : l'adresse de l'appli avec le
 * code du salon. Scannée avec l'appareil photo, elle ouvre l'appli sur ce salon.
 */
export function lienSalon(adresseAppli: string, code: string): string {
  const url = new URL(adresseAppli);
  url.search = '';
  url.hash = '';
  url.searchParams.set(PARAMETRE_SALON, code);
  return url.href;
}

/** Code de salon présent dans une adresse ouverte (lien du QR code), sinon `null` (D-A3-02). */
export function codeDansAdresse(adresse: string): string | null {
  try {
    return normaliserCode(new URL(adresse).searchParams.get(PARAMETRE_SALON));
  } catch {
    return null;
  }
}

/** Jeux connus de ce téléphone avec leur version, envoyés à l'entrée d'un salon (D-A1-08). */
export function catalogue(registre: Registre): CatalogueJeux {
  return Object.fromEntries(registre.lister().map((jeu) => [jeu.fiche.id, jeu.fiche.version]));
}

/** Nombre de places du salon : le maximum du jeu, sans dépasser 8 (D-A2-01). */
export function placesMax(fiche: FicheJeu): number {
  return Math.min(fiche.joueursMax, MAX_JOUEURS);
}

/** Un ordinateur ajouté au salon par l'hôte ; c'est le téléphone de l'hôte qui le fait jouer. */
export interface Robot {
  niveau: NiveauOrdinateur;
}

export type EtatLancement =
  | { possible: true }
  | { possible: false; raison: 'pas-assez'; manque: number }
  | { possible: false; raison: 'trop'; enTrop: number };

/** La partie ne se lance qu'avec un nombre de joueurs que le jeu accepte (D-A3-04). */
export function etatLancement(fiche: FicheJeu, humains: number, robots: number): EtatLancement {
  const total = humains + robots;
  if (total < fiche.joueursMin) return { possible: false, raison: 'pas-assez', manque: fiche.joueursMin - total };
  if (total > placesMax(fiche)) return { possible: false, raison: 'trop', enTrop: total - placesMax(fiche) };
  return { possible: true };
}

/** Vrai si l'hôte peut encore ajouter un robot. */
export function peutAjouterRobot(fiche: FicheJeu, humains: number, robots: number): boolean {
  return humains + robots < placesMax(fiche);
}

/**
 * Robots gardés quand des humains arrivent : les humains passent avant, un
 * robot cède sa place au dernier arrivé si le salon est complet.
 */
export function robotsGardes(fiche: FicheJeu, humains: number, robots: readonly Robot[]): Robot[] {
  return robots.slice(0, Math.max(0, placesMax(fiche) - humains));
}

/**
 * Donne à chacun une couleur différente : chaque joueur garde la sienne si
 * personne ne l'a prise avant lui (et qu'elle est valide), sinon il reçoit la première libre.
 */
export function couleursDistinctes(couleurs: readonly string[], palette: readonly string[]): string[] {
  const prises = new Set<string>();
  const resultat = couleurs.map((c) => {
    if (!/^#[0-9a-f]{6}$/i.test(c) || prises.has(c)) return null;
    prises.add(c);
    return c;
  });
  return resultat.map((c) => {
    if (c !== null) return c;
    const libre = palette.find((p) => !prises.has(p)) ?? palette[0]!;
    prises.add(libre);
    return libre;
  });
}

/** Données de lancement envoyées à chaque invité, opaques pour le réseau (D-A3-13). */
export interface DonneesLancement {
  joueurs: (Joueur & { robot: boolean })[];
}

export interface Composition {
  places: Place[];
  /** Place de chaque invité dans la partie, par identifiant de participant. */
  placeDesInvites: Map<number, number>;
  donnees: DonneesLancement;
}

/**
 * Places de la partie : l'hôte (place 0), puis les invités dans l'ordre
 * d'arrivée, puis les robots. Les couleurs en double sont remplacées.
 */
export function composerPartie(
  participants: readonly Participant[],
  robots: readonly Robot[],
  nomRobot: (n: number) => string,
  palette: readonly string[],
): Composition {
  const brutes: Place[] = [
    ...participants.map((p): Place => ({ joueur: { ...p.joueur }, controle: { type: 'humain' } })),
    ...robots.map((r, i): Place => ({ joueur: { pseudo: nomRobot(i + 1), couleur: '' }, controle: { type: 'ordinateur', niveau: r.niveau } })),
  ];
  const couleurs = couleursDistinctes(
    brutes.map((p) => p.joueur.couleur),
    palette,
  );
  const places = brutes.map((p, i) => ({ ...p, joueur: { ...p.joueur, couleur: couleurs[i]! } }));
  const placeDesInvites = new Map(participants.filter((p) => p.id !== 0).map((p) => [p.id, participants.indexOf(p)]));
  return {
    places,
    placeDesInvites,
    donnees: { joueurs: places.map((p) => ({ ...p.joueur, robot: p.controle.type === 'ordinateur' })) },
  };
}

/** Lit les données de lancement reçues de l'hôte, sans les croire sur parole. */
export function lireDonneesLancement(brut: unknown): DonneesLancement {
  const joueurs = (brut as { joueurs?: unknown } | null)?.joueurs;
  if (!Array.isArray(joueurs)) return { joueurs: [] };
  return {
    joueurs: joueurs.map((j: { pseudo?: unknown; couleur?: unknown; robot?: unknown }) => ({
      pseudo: typeof j?.pseudo === 'string' ? j.pseudo : '?',
      couleur: typeof j?.couleur === 'string' ? j.couleur : '#888888',
      robot: j?.robot === true,
    })),
  };
}

/** Erreurs réseau qui ont un message dédié à l'écran ; les autres prennent le message général. */
export const ERREURS_SALON: readonly CodeErreurReseau[] = [
  'config-introuvable',
  'serveur-injoignable',
  'salon-introuvable',
  'salon-plein',
  'version-differente',
  'partie-lancee',
  'connexion-directe-impossible',
  'salon-ferme',
];
