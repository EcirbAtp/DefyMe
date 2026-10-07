import { t, type CleTexte } from '../i18n';
import {
  ECRAN,
  NIVEAUX_ORDINATEUR,
  type ConstructeurScene,
  type DonneesEcran,
  type Fin,
  type JeuQuelconque,
  type Langue,
  type NiveauOrdinateur,
  type Variante,
} from '../noyau/contrat';
import type { Registre } from '../noyau/registre';
import { SessionDePartie, type Place, type Sauvegarde } from '../noyau/session';
import { COULEURS, type Reglages, type Stockage } from '../stockage/reglages';
import { el } from './dom';
import { afficherMenuJeux } from './menu-jeux';

/**
 * Page d'un jeu en mode « un seul téléphone » (D-A2-07) : le joueur choisit
 * ses adversaires ordinateurs, leur niveau et les variantes, puis joue. La
 * partie tourne dans la même session que le mode réseau (D-A1-06), sans
 * réseau. Elle est sauvegardée à chaque coup et reprise à la réouverture
 * (D-D-09). La même page propose de créer ou de rejoindre un salon.
 *
 * L'écran du jeu (scène Phaser) n'est chargé qu'au lancement d'une partie,
 * pour garder le premier chargement léger (D-C-07).
 */

export interface ContextePartie {
  langue: Langue;
  reglages: Reglages;
  stockage: (Stockage & { removeItem?(cle: string): void }) | undefined;
  /** Monte l'écran du jeu ; remplacé dans les tests. Renvoie la fonction qui le démonte. */
  monter?: Monteur;
  /** Pause avant chaque coup de l'ordinateur, en millisecondes, pour qu'on le voie jouer. */
  pauseOrdinateurMs?: number;
}

export type Monteur = (
  conteneur: HTMLElement,
  chargerScene: () => Promise<ConstructeurScene>,
  donnees: DonneesEcran<unknown, unknown>,
) => Promise<() => void>;

type Session = SessionDePartie<unknown, unknown, unknown, unknown>;

/** Pause par défaut avant chaque coup de l'ordinateur. */
export const PAUSE_ORDINATEUR_MS = 700;

/** Partie ou salon en cours d'affichage, à arrêter quand on quitte la page. */
let arreterPartieEnCours: (() => void) | null = null;

/** Arrête l'écran et l'ordinateur de la partie affichée (la sauvegarde reste), ou ferme le salon affiché. */
export function quitterPartie(): void {
  arreterPartieEnCours?.();
  arreterPartieEnCours = null;
}

/** Enregistre ce qu'il faudra arrêter en quittant la page (partie, salon). */
export function arreterEnQuittant(arret: () => void): void {
  quitterPartie();
  arreterPartieEnCours = arret;
}

export const cleSauvegarde = (id: string): string => `defyme.partie.${id}.v1`;

/** Lit la partie sauvegardée de ce jeu, si elle existe et se reprend encore. */
export function lireSauvegarde(jeu: JeuQuelconque, stockage: ContextePartie['stockage']): Session | null {
  try {
    const texte = stockage?.getItem(cleSauvegarde(jeu.fiche.id));
    if (!texte) return null;
    return SessionDePartie.reprendre(jeu, JSON.parse(texte) as Sauvegarde<unknown, unknown, unknown>);
  } catch {
    return null;
  }
}

function effacerSauvegarde(jeu: JeuQuelconque, stockage: ContextePartie['stockage']): void {
  try {
    if (stockage?.removeItem) stockage.removeItem(cleSauvegarde(jeu.fiche.id));
    else stockage?.setItem(cleSauvegarde(jeu.fiche.id), '');
  } catch {
    // Stockage refusé : il n'y a rien à effacer.
  }
}

function sauvegarder(session: Session, stockage: ContextePartie['stockage']): void {
  try {
    stockage?.setItem(cleSauvegarde(session.jeu.fiche.id), JSON.stringify(session.sauvegarder()));
  } catch {
    // Navigation privée ou stockage plein : la partie continue sans sauvegarde.
  }
}

/** Page d'un jeu : reprise de la partie sauvegardée ou préparation d'une nouvelle. */
export function afficherPageJeu(conteneur: HTMLElement, registre: Registre, id: string, contexte: ContextePartie): void {
  quitterPartie();
  const jeu = registre.trouver(id);
  if (!jeu) {
    afficherMenuJeux(conteneur, registre, contexte.langue);
    return;
  }
  const { langue } = contexte;
  const titre = el('h1', {}, `${jeu.fiche.icone} ${jeu.fiche.nom[langue]}`);
  const sauvegarde = lireSauvegarde(jeu, contexte.stockage);

  if (sauvegarde) {
    const reprendre = el('button', { type: 'button', class: 'bouton', 'data-action': 'reprendre' }, t('partie.reprendre'));
    const nouvelle = el('button', { type: 'button', class: 'bouton bouton--discret', 'data-action': 'nouvelle' }, t('partie.nouvelle'));
    reprendre.addEventListener('click', () => lancerPartie(conteneur, registre, sauvegarde, contexte));
    nouvelle.addEventListener('click', () => {
      effacerSauvegarde(jeu, contexte.stockage);
      afficherPageJeu(conteneur, registre, id, contexte);
    });
    conteneur.replaceChildren(
      titre,
      el('p', {}, t('partie.enCours')),
      el('div', { class: 'actions' }, reprendre, nouvelle),
      blocSalon(id),
      lienRetour(),
    );
    return;
  }

  conteneur.replaceChildren(
    titre,
    el('p', { class: 'discret' }, jeu.fiche.description[langue]),
    blocSalon(id),
    el('h2', {}, t('salon.seul')),
    formulaire(jeu, contexte, (session) => {
      lancerPartie(conteneur, registre, session, contexte);
    }),
    lienRetour(),
  );
}

/** Jouer à plusieurs : créer un salon en un geste (D-A3-01), ou en rejoindre un (D-A3-02). */
function blocSalon(id: string): HTMLElement {
  return el(
    'section',
    { class: 'bloc-salon' },
    el('h2', {}, t('salon.plusieurs')),
    el(
      'div',
      { class: 'actions' },
      el('a', { class: 'bouton', href: `#/salon/${encodeURIComponent(id)}`, 'data-action': 'creer-salon' }, t('salon.creer')),
      el('a', { class: 'bouton bouton--discret', href: '#/rejoindre', 'data-action': 'rejoindre-salon' }, t('salon.rejoindre')),
    ),
  );
}

export function lienRetour(): HTMLElement {
  return el('a', { class: 'bouton bouton--discret', href: '#/jeux' }, t('jeux.retour'));
}

/** Choix des adversaires, du niveau et des variantes. */
function formulaire(jeu: JeuQuelconque, contexte: ContextePartie, lancer: (session: Session) => void): HTMLFormElement {
  const { reglages } = contexte;
  const { joueursMin, joueursMax } = jeu.fiche;

  const adversaires = el('select', { id: 'adversaires', name: 'adversaires' });
  for (let n = Math.max(1, joueursMin - 1); n <= joueursMax - 1; n++) {
    adversaires.append(el('option', { value: String(n) }, t('partie.adversairesN', { n })));
  }
  adversaires.value = String(Math.min(joueursMax - 1, 3));

  const niveau = listeNiveaux('niveau');
  const variantes = champsVariantes(jeu, contexte.langue);

  const form = el(
    'form',
    { class: 'parametres preparation' },
    el('label', { for: 'adversaires' }, t('partie.adversaires')),
    adversaires,
    el('label', { for: 'niveau' }, t('partie.niveau')),
    niveau,
    variantes.element,
    el('button', { type: 'submit', class: 'bouton' }, t('partie.jouer')),
  );
  form.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    const places = placesSolo(reglages, Number(adversaires.value), Number(niveau.value) as NiveauOrdinateur);
    lancer(SessionDePartie.creer(jeu, places, { options: variantes.lire() }));
  });
  return form;
}

/** Liste des niveaux de l'ordinateur, « Moyen » présélectionné (D-A2-09). */
export function listeNiveaux(id: string): HTMLSelectElement {
  const niveau = el('select', { id, name: id });
  for (const n of NIVEAUX_ORDINATEUR) niveau.append(el('option', { value: String(n) }, t(`partie.niveau${n}` as CleTexte)));
  niveau.value = '2';
  return niveau;
}

/**
 * Choix des variantes de règles d'un jeu, repliés par défaut. `lire` renvoie
 * les options du jeu avec les choix faits. Sert au mode un seul téléphone
 * comme au salon.
 */
export function champsVariantes(jeu: JeuQuelconque, langue: Langue): { element: HTMLElement | null; lire(): unknown } {
  const variantes = (jeu.variantes ?? []) as readonly Variante[];
  const listes = variantes.map((variante) => {
    const liste = el('select', { id: `variante-${variante.cle}`, name: variante.cle });
    variante.choix.forEach((choix, i) => liste.append(el('option', { value: String(i) }, choix.nom[langue])));
    const defaut = variante.choix.findIndex((c) => c.valeur === (jeu.optionsParDefaut as Record<string, unknown>)[variante.cle]);
    liste.value = String(Math.max(0, defaut));
    return liste;
  });
  let element: HTMLElement | null = null;
  if (variantes.length > 0) {
    const details = el('details', { class: 'variantes' }, el('summary', {}, t('partie.variantes')));
    variantes.forEach((variante, i) => details.append(el('label', { for: `variante-${variante.cle}` }, variante.nom[langue]), listes[i]!));
    element = details;
  }
  return {
    element,
    lire() {
      const options = { ...(jeu.optionsParDefaut as Record<string, unknown>) };
      variantes.forEach((variante, i) => {
        options[variante.cle] = variante.choix[Number(listes[i]!.value)]?.valeur ?? options[variante.cle];
      });
      return options;
    },
  };
}

/** Le joueur à la place 0, puis les ordinateurs, chacun d'une autre couleur. */
export function placesSolo(reglages: Reglages, adversaires: number, niveau: NiveauOrdinateur): Place[] {
  const autres = COULEURS.filter((c) => c !== reglages.couleur);
  const moi: Place = { joueur: { pseudo: reglages.pseudo || t('partie.toi'), couleur: reglages.couleur }, controle: { type: 'humain' } };
  const ordinateurs: Place[] = Array.from({ length: adversaires }, (_, i) => ({
    joueur: { pseudo: t('partie.ordinateur', { n: i + 1 }), couleur: autres[i % autres.length]! },
    controle: { type: 'ordinateur', niveau },
  }));
  return [moi, ...ordinateurs];
}

/** Une partie prête à afficher, qu'elle tourne sur ce téléphone ou chez l'hôte. */
export interface PartieAAfficher {
  jeu: JeuQuelconque;
  donnees: DonneesEcran<unknown, unknown>;
  /** Pseudo de chaque place, pour annoncer le gagnant. */
  noms: readonly string[];
  /** Bouton « Rejouer » de fin de partie ; absent, seul le retour aux jeux est proposé. */
  rejouer?: () => void;
}

export interface EcranAffiche {
  montrerFin(fin: Fin): void;
  /** Affiche un message en bas de l'écran (salon fermé, joueur parti…), avec le retour aux jeux. */
  montrerMessage(texte: string): void;
  /** Petite annonce au-dessus de l'écran, sans arrêter la partie (un joueur est parti…). */
  annoncer(texte: string): void;
  arreter(): void;
}

/**
 * Affiche l'écran d'un jeu et son panneau de fin. Commun au mode un seul
 * téléphone et au réseau, pour l'hôte comme pour les invités.
 */
export function afficherEcranPartie(
  conteneur: HTMLElement,
  partie: PartieAAfficher,
  contexte: Pick<ContextePartie, 'langue' | 'monter'>,
): EcranAffiche {
  const { jeu, donnees } = partie;
  const zone = el('div', { class: 'ecran-jeu', 'data-jeu': jeu.fiche.id });
  const panneau = el('div', { class: 'fin-partie', hidden: true, role: 'status' });
  const annonce = el('p', { class: 'annonce', role: 'status', hidden: true });
  const quitter = el('a', { class: 'bouton bouton--discret', href: '#/jeux' }, t('partie.quitter'));
  conteneur.replaceChildren(
    el('div', { class: 'barre-partie' }, el('strong', {}, `${jeu.fiche.icone} ${jeu.fiche.nom[contexte.langue]}`), quitter),
    annonce,
    zone,
    panneau,
  );

  let demonter: (() => void) | null = null;
  let arrete = false;
  const monter = contexte.monter ?? monterAvecPhaser;
  void monter(zone, () => jeu.ecran(), donnees)
    .then((d) => {
      if (arrete) d();
      else demonter = d;
    })
    .catch(() => zone.replaceChildren(el('p', {}, t('partie.erreurEcran'))));

  const montrerMessage = (texte: string, boutons: HTMLElement[] = []): void => {
    panneau.replaceChildren(el('p', {}, el('strong', {}, texte)), el('div', { class: 'actions' }, ...boutons, lienRetour()));
    panneau.hidden = false;
  };

  return {
    montrerFin(fin) {
      const message = fin.gagnants.includes(donnees.joueur)
        ? t('partie.gagne')
        : t('partie.perdu', { nom: fin.gagnants.map((g) => partie.noms[g] ?? '').join(', ') });
      const boutons: HTMLElement[] = [];
      if (partie.rejouer) {
        const rejouer = el('button', { type: 'button', class: 'bouton' }, t('partie.rejouer'));
        rejouer.addEventListener('click', partie.rejouer);
        boutons.push(rejouer);
      }
      montrerMessage(message, boutons);
    },
    montrerMessage: (texte) => montrerMessage(texte),
    annoncer(texte) {
      annonce.textContent = texte;
      annonce.hidden = false;
    },
    arreter() {
      arrete = true;
      demonter?.();
    },
  };
}

/** Affiche l'écran du jeu et fait tourner la partie jusqu'à sa fin. */
function lancerPartie(conteneur: HTMLElement, registre: Registre, session: Session, contexte: ContextePartie): void {
  quitterPartie();
  const { jeu } = session;
  const moi = session.places.findIndex((p) => p.controle.type === 'humain');
  const pause = contexte.pauseOrdinateurMs ?? PAUSE_ORDINATEUR_MS;

  const abonnes = new Set<(vue: unknown) => void>();
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  let arretee = false;

  const faireJouerOrdinateur = (): void => {
    clearTimeout(minuterie);
    if (arretee || !session.auTourDeLOrdinateur) return;
    minuterie = setTimeout(() => {
      if (!arretee) session.faireJouerOrdinateur();
    }, pause);
  };

  const donnees: DonneesEcran<unknown, unknown> = {
    joueur: moi,
    langue: contexte.langue,
    vue: () => session.vuePour(moi),
    surNouvelleVue(rappel) {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
    proposerCoup(coup) {
      if (!arretee) session.proposerCoup(moi, coup);
    },
  };

  sauvegarder(session, contexte.stockage);
  const ecran = afficherEcranPartie(
    conteneur,
    {
      jeu,
      donnees,
      noms: session.places.map((p) => p.joueur.pseudo),
      rejouer: () => afficherPageJeu(conteneur, registre, jeu.fiche.id, contexte),
    },
    contexte,
  );

  const desabonner = session.ecouter(({ fin: terminee }) => {
    if (terminee) effacerSauvegarde(jeu, contexte.stockage);
    else sauvegarder(session, contexte.stockage);
    const vue = session.vuePour(moi);
    for (const abonne of abonnes) abonne(vue);
    if (terminee) ecran.montrerFin(terminee);
    else faireJouerOrdinateur();
  });

  arreterEnQuittant(() => {
    arretee = true;
    clearTimeout(minuterie);
    desabonner();
    abonnes.clear();
    ecran.arreter();
  });

  if (session.fin) ecran.montrerFin(session.fin);
  else faireJouerOrdinateur();
}

/** Monte la scène du jeu dans Phaser, mise à l'échelle de l'écran du téléphone. */
const monterAvecPhaser: Monteur = async (conteneur, chargerScene, donnees) => {
  const [{ default: Phaser }, scene] = await Promise.all([import('phaser'), chargerScene()]);
  const jeu = new Phaser.Game({
    type: Phaser.AUTO,
    parent: conteneur,
    width: ECRAN.largeur,
    height: ECRAN.hauteur,
    transparent: true,
    banner: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
  });
  // La scène est ajoutée une fois Phaser prêt : avant, Phaser perdrait les données passées.
  jeu.events.once(Phaser.Core.Events.READY, () => {
    jeu.scene.add('jeu', scene as unknown as Phaser.Types.Scenes.SceneType, true, donnees as object);
  });
  return () => jeu.destroy(true);
};
