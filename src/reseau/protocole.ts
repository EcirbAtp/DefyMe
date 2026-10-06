import type { Fin, Joueur } from '../noyau/contrat';

/**
 * Messages échangés entre l'hôte et les invités, une fois la connexion
 * directe établie (D-A3-13).
 *
 * Ils sont génériques : le réseau ne connaît aucun jeu. Un coup, une vue ou
 * les données de lancement sont des valeurs JSON opaques qu'il transporte
 * sans les lire ; seule la session de partie, sur le téléphone de l'hôte,
 * les comprend (D-A1-10).
 */

/** Version du protocole. À augmenter à chaque changement incompatible des messages (D-A1-08). */
export const PROTOCOLE = 1;

/** Taille maximale d'un message, en caractères. Au-delà, il est ignoré. */
export const TAILLE_MAX_MESSAGE = 65_536;

/** Le jeu, tel que le salon le compare à l'entrée (D-A1-08). */
export interface JeuDuSalon {
  id: string;
  version: number;
}

/**
 * Jeux connus d'un téléphone, avec leur version : `{ "petits-chevaux": 1 }`.
 * L'invité ne sait pas encore à quoi joue le salon : il envoie tout son catalogue.
 */
export type CatalogueJeux = Record<string, number>;

export type RaisonRefus = 'protocole-different' | 'version-differente' | 'salon-plein' | 'partie-lancee';

/** Un participant du salon, tel que tous le voient. L'hôte a l'identifiant 0. */
export interface Participant {
  id: number;
  joueur: Joueur;
}

/** Messages d'un invité vers l'hôte. */
export type MessageInvite =
  | { type: 'bonjour'; protocole: number; jeux: CatalogueJeux; joueur: Joueur }
  | { type: 'coup'; coup: unknown }
  | { type: 'ping'; n: number }
  | { type: 'quitter' };

/** Messages de l'hôte vers un invité. */
export type MessageHote =
  | { type: 'bienvenue'; id: number; jeu: JeuDuSalon }
  | { type: 'refus'; raison: RaisonRefus }
  | { type: 'participants'; liste: Participant[] }
  | { type: 'lancer'; place: number; donnees: unknown }
  | { type: 'vue'; vue: unknown; tour: number; fin: Fin | null }
  | { type: 'coup-refuse'; raison: string }
  | { type: 'pong'; n: number }
  | { type: 'fermeture' };

export type Message = MessageInvite | MessageHote;

const CHAMPS: Record<Message['type'], (m: Record<string, unknown>) => boolean> = {
  bonjour: (m) => Number.isInteger(m.protocole) && estCatalogue(m.jeux) && estJoueur(m.joueur),
  coup: (m) => 'coup' in m,
  ping: (m) => Number.isInteger(m.n),
  quitter: () => true,
  bienvenue: (m) => Number.isInteger(m.id) && estJeu(m.jeu),
  refus: (m) => typeof m.raison === 'string',
  participants: (m) => Array.isArray(m.liste) && m.liste.every((p) => estObjet(p) && Number.isInteger(p.id) && estJoueur(p.joueur)),
  lancer: (m) => Number.isInteger(m.place) && 'donnees' in m,
  vue: (m) => 'vue' in m && Number.isInteger(m.tour) && (m.fin === null || (estObjet(m.fin) && Array.isArray(m.fin.gagnants))),
  'coup-refuse': (m) => typeof m.raison === 'string',
  pong: (m) => Number.isInteger(m.n),
  fermeture: () => true,
};

/** Transforme un message en texte pour le canal. */
export function ecrireMessage(message: Message): string {
  return JSON.stringify(message);
}

/**
 * Lit un message reçu. Renvoie `null` pour tout ce qui n'est pas un message
 * connu et bien formé : un pair n'est jamais cru sur parole.
 */
export function lireMessage(texte: unknown): Message | null {
  if (typeof texte !== 'string' || texte.length > TAILLE_MAX_MESSAGE) return null;
  let valeur: unknown;
  try {
    valeur = JSON.parse(texte);
  } catch {
    return null;
  }
  if (!estObjet(valeur) || typeof valeur.type !== 'string' || !Object.hasOwn(CHAMPS, valeur.type)) return null;
  return CHAMPS[valeur.type as Message['type']](valeur) ? (valeur as Message) : null;
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function estJeu(v: unknown): v is JeuDuSalon {
  return estObjet(v) && typeof v.id === 'string' && Number.isInteger(v.version);
}

function estCatalogue(v: unknown): v is CatalogueJeux {
  return estObjet(v) && Object.values(v).every((version) => Number.isInteger(version));
}

function estJoueur(v: unknown): v is Joueur {
  return estObjet(v) && typeof v.pseudo === 'string' && v.pseudo.length <= 40 && typeof v.couleur === 'string';
}
