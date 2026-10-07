import { t, type CleTexte } from '../i18n';
import type { DonneesEcran, JeuQuelconque, Joueur, NiveauOrdinateur } from '../noyau/contrat';
import type { Registre } from '../noyau/registre';
import { SessionDePartie } from '../noyau/session';
import { ErreurReseau, HoteReseau, brancherPartie, entrerDansLeSalon, type InviteReseau, type Participant } from '../reseau';
import type { AccesReseau, SalonOuvert } from '../salon/acces';
import {
  ERREURS_SALON,
  catalogue,
  composerPartie,
  couleursDistinctes,
  etatLancement,
  lienSalon,
  lireDonneesLancement,
  normaliserCode,
  peutAjouterRobot,
  placesMax,
  robotsGardes,
  type Composition,
  type Robot,
} from '../salon/salon';
import { COULEURS } from '../stockage/reglages';
import { el } from './dom';
import { afficherMenuJeux } from './menu-jeux';
import {
  PAUSE_ORDINATEUR_MS,
  afficherEcranPartie,
  arreterEnQuittant,
  champsVariantes,
  lienRetour,
  listeNiveaux,
  type ContextePartie,
  type EcranAffiche,
} from './partie';
import { dessinerQr } from './qr';

/**
 * Écrans des salons (étape 3) : l'hôte crée le salon depuis un jeu, les
 * invités le rejoignent par le code ou par le lien du QR code, puis la
 * partie se joue en réseau. L'hôte fait tourner la session et arbitre
 * (D-A2-02) ; chaque invité ne reçoit que sa vue (D-A2-03). Rien ici ne
 * dépend d'un jeu particulier : tout jeu du registre se joue ainsi (D-A1-05).
 */

export interface ContexteSalon extends ContextePartie {
  registre: Registre;
  acces: AccesReseau;
  /** Adresse où l'appli est ouverte, pour fabriquer le lien du QR code. */
  adresseAppli: string;
}

/** Message clair pour une erreur réseau (D-A3-09, D-A3-12, D-A1-08). */
export function messageErreur(erreur: unknown): string {
  const code = erreur instanceof ErreurReseau && ERREURS_SALON.includes(erreur.code) ? erreur.code : null;
  return t(code ? (`salon.erreur.${code}` as CleTexte) : 'salon.erreur.inconnue');
}

function moi(contexte: ContexteSalon): Joueur {
  return { pseudo: contexte.reglages.pseudo || t('joueur.parDefaut'), couleur: contexte.reglages.couleur };
}

const nomRobot = (n: number): string => t('partie.ordinateur', { n });

function titreJeu(jeu: JeuQuelconque, contexte: ContexteSalon): HTMLElement {
  return el('h1', {}, `${jeu.fiche.icone} ${jeu.fiche.nom[contexte.langue]}`);
}

/** Une ligne de la liste des joueurs : pastille de couleur, pseudo, mention, bouton éventuel. */
function ligneJoueur(joueur: Joueur, mention: string | null, bouton?: HTMLElement): HTMLLIElement {
  const pastille = el('span', { class: 'pastille', 'aria-hidden': 'true' });
  pastille.style.background = joueur.couleur;
  return el(
    'li',
    { class: 'joueur-salon' },
    pastille,
    el('span', { class: 'joueur-salon__nom' }, joueur.pseudo, mention ? el('span', { class: 'discret' }, ` (${mention})`) : null),
    bouton,
  );
}

/** Liste des arrêts à faire en quittant la page ; `arrete` passe à vrai dès qu'on part. */
function preparerArret(): { arrets: (() => void)[]; arrete: () => boolean } {
  let arrete = false;
  const arrets: (() => void)[] = [];
  arreterEnQuittant(() => {
    arrete = true;
    for (const arret of arrets.splice(0).reverse()) arret();
  });
  return { arrets, arrete: () => arrete };
}

// ————————————————————————————————————————— Hôte —————————————————————————————————————————

/** Crée le salon d'un jeu en un geste (D-A3-01) et affiche la salle d'attente de l'hôte. */
export function afficherSalonHote(conteneur: HTMLElement, idJeu: string, contexte: ContexteSalon): void {
  const jeu = contexte.registre.trouver(idJeu);
  if (!jeu) {
    afficherMenuJeux(conteneur, contexte.registre, contexte.langue);
    return;
  }
  const { arrets, arrete } = preparerArret();

  const ouvrir = (): void => {
    conteneur.replaceChildren(titreJeu(jeu, contexte), el('p', { role: 'status', class: 'etat-salon' }, t('salon.creation')), lienRetour());
    contexte.acces.ouvrir().then(
      (salon) => {
        if (arrete()) return salon.fermer();
        arrets.push(() => salon.fermer());
        salleHote(conteneur, jeu, salon, contexte, arrets);
      },
      (erreur: unknown) => {
        if (arrete()) return;
        const reessayer = el('button', { type: 'button', class: 'bouton', 'data-action': 'reessayer' }, t('salon.reessayer'));
        reessayer.addEventListener('click', ouvrir);
        conteneur.replaceChildren(
          titreJeu(jeu, contexte),
          el('p', { role: 'alert', class: 'erreur', 'data-erreur': erreur instanceof ErreurReseau ? erreur.code : 'inconnue' }, messageErreur(erreur)),
          el('div', { class: 'actions' }, reessayer, lienRetour()),
        );
      },
    );
  };
  ouvrir();
}

/** Salle d'attente de l'hôte : code, QR code, joueurs en direct, robots, variantes, lancement. */
function salleHote(conteneur: HTMLElement, jeu: JeuQuelconque, salon: SalonOuvert, contexte: ContexteSalon, arrets: (() => void)[]): void {
  const { fiche } = jeu;
  const hote = new HoteReseau({ jeu: { id: fiche.id, version: fiche.version }, joueur: moi(contexte), maxInvites: placesMax(fiche) - 1 });
  arrets.push(() => hote.fermer());
  arrets.push(salon.surCanal((canal) => hote.accueillir(canal)));
  let robots: Robot[] = [];

  const lien = lienSalon(contexte.adresseAppli, salon.code);
  const qr = el('div', { class: 'qr-salon' });
  dessinerQr(lien, t('salon.qr', { code: salon.code })).then(
    (svg) => qr.replaceChildren(svg),
    () => qr.remove(),
  );

  const compte = el('span', { class: 'compte-places', 'data-places': '' });
  const liste = el('ul', { class: 'joueurs-salon', 'aria-live': 'polite' });
  const niveau = listeNiveaux('niveau-robot');
  const ajouter = el('button', { type: 'button', class: 'bouton bouton--discret', 'data-action': 'ajouter-robot' }, t('salon.ajouterRobot'));
  const variantes = champsVariantes(jeu, contexte.langue);
  const aide = el('p', { class: 'discret', 'aria-live': 'polite' });
  const lancer = el('button', { type: 'button', class: 'bouton', 'data-action': 'lancer' }, t('salon.lancer'));
  const alerte = el('p', { class: 'avertissement', role: 'status', hidden: true }, t('salon.liaisonPerdue'));

  const maj = (): void => {
    const participants = hote.participants;
    robots = robotsGardes(fiche, participants.length, robots);
    const { places } = composerPartie(participants, robots, nomRobot, COULEURS);
    compte.textContent = t('salon.places', { n: places.length, max: placesMax(fiche) });
    liste.replaceChildren(
      ...places.map((place, i) => {
        if (i < participants.length) return ligneJoueur(place.joueur, i === 0 ? `${t('salon.hote')}, ${t('salon.toi')}` : null);
        const r = i - participants.length;
        const nom = place.joueur.pseudo;
        const retirer = el('button', { type: 'button', class: 'bouton bouton--discret bouton--petit', 'aria-label': t('salon.retirerRobot', { nom }), 'data-action': 'retirer-robot' }, '✕');
        retirer.addEventListener('click', () => {
          robots.splice(r, 1);
          maj();
        });
        const niveauRobot = t(`partie.niveau${robots[r]!.niveau}` as CleTexte);
        return ligneJoueur({ ...place.joueur, pseudo: t('salon.robot', { nom, niveau: niveauRobot }) }, null, retirer);
      }),
    );
    const plein = !peutAjouterRobot(fiche, participants.length, robots.length);
    ajouter.disabled = plein;
    const etat = etatLancement(fiche, participants.length, robots.length);
    lancer.disabled = !etat.possible;
    if (etat.possible) aide.textContent = plein ? `${t('salon.complet')} ${t('salon.pret')}` : t('salon.pret');
    else if (etat.raison === 'pas-assez') aide.textContent = t('salon.manque', { n: etat.manque });
    else aide.textContent = t('salon.enTrop', { n: etat.enTrop });
  };

  ajouter.addEventListener('click', () => {
    if (!peutAjouterRobot(fiche, hote.participants.length, robots.length)) return;
    robots.push({ niveau: Number(niveau.value) as NiveauOrdinateur });
    maj();
  });
  arrets.push(hote.surChangement(maj));
  arrets.push(
    salon.surFermeture((erreur) => {
      if (erreur) alerte.hidden = false;
    }),
  );

  lancer.addEventListener('click', () => {
    const participants = hote.participants;
    if (!etatLancement(fiche, participants.length, robots.length).possible) return;
    const composition = composerPartie(participants, robots, nomRobot, COULEURS);
    // Plus personne n'entre : le code ne mène plus nulle part (D-A3-05).
    salon.fermer();
    const session = SessionDePartie.creer(jeu, composition.places, { options: variantes.lire() });
    partieHote(conteneur, session, hote, composition, contexte, arrets);
  });

  conteneur.replaceChildren(
    titreJeu(jeu, contexte),
    el('p', {}, t('salon.ouvert')),
    el(
      'div',
      { class: 'carte-salon' },
      el('span', { class: 'etiquette' }, t('salon.code')),
      el('strong', { class: 'code-salon', 'data-code': salon.code }, salon.code),
      qr,
      el('a', { class: 'lien-salon discret', href: lien }, lien),
    ),
    alerte,
    el('h2', {}, t('salon.joueurs'), ' ', compte),
    liste,
    el('div', { class: 'ajout-robot' }, el('label', { for: 'niveau-robot' }, t('partie.niveau')), niveau, ajouter),
    variantes.element ?? '',
    aide,
    el('div', { class: 'actions' }, lancer, el('a', { class: 'bouton bouton--discret', href: '#/jeux' }, t('salon.fermer'))),
  );
  maj();
}

type Session = SessionDePartie<unknown, unknown, unknown, unknown>;

/**
 * La partie chez l'hôte : la session tourne sur son téléphone, le pont
 * envoie à chaque invité sa vue et fait jouer les robots. Un invité qui part
 * est remplacé par l'ordinateur (D-A2-04).
 */
function partieHote(
  conteneur: HTMLElement,
  session: Session,
  hote: HoteReseau,
  composition: Composition,
  contexte: ContexteSalon,
  arrets: (() => void)[],
): void {
  const pause = contexte.pauseOrdinateurMs ?? PAUSE_ORDINATEUR_MS;
  const abonnes = new Set<(vue: unknown) => void>();
  let arretee = false;
  const donnees: DonneesEcran<unknown, unknown> = {
    joueur: 0,
    langue: contexte.langue,
    vue: () => session.vuePour(0),
    surNouvelleVue(rappel) {
      abonnes.add(rappel);
      return () => abonnes.delete(rappel);
    },
    proposerCoup(coup) {
      if (!arretee) session.proposerCoup(0, coup);
    },
  };
  const ecran = afficherEcranPartie(conteneur, { jeu: session.jeu, donnees, noms: composition.places.map((p) => p.joueur.pseudo) }, contexte);

  const desabonner = session.ecouter(({ fin }) => {
    const vue = session.vuePour(0);
    for (const abonne of abonnes) abonne(vue);
    if (fin) ecran.montrerFin(fin);
  });
  const debrancher = brancherPartie(hote, session, {
    places: composition.placeDesInvites,
    donnees: composition.donnees,
    delaiOrdinateurMs: pause,
  });

  let releve: ReturnType<typeof setTimeout> | undefined;
  const arreterDeparts = hote.surDepart((participant: Participant) => {
    const place = composition.placeDesInvites.get(participant.id);
    if (place === undefined || session.fin) return;
    session.changerControle(place, { type: 'ordinateur', niveau: 2 });
    ecran.annoncer(t('salon.depart', { nom: participant.joueur.pseudo }));
    // C'était peut-être son tour : l'ordinateur prend la main tout de suite.
    if (session.auTourDeLOrdinateur && session.joueurCourant === place) {
      clearTimeout(releve);
      releve = setTimeout(() => session.faireJouerOrdinateur(), pause);
    }
  });

  arrets.push(() => {
    arretee = true;
    clearTimeout(releve);
    arreterDeparts();
    debrancher();
    desabonner();
    abonnes.clear();
    ecran.arreter();
  });
  if (session.fin) ecran.montrerFin(session.fin);
}

// ————————————————————————————————————————— Invité —————————————————————————————————————————

/**
 * Rejoindre un salon par son code (D-A3-02). Avec un code reçu par le lien
 * du QR code, l'entrée se fait tout de suite.
 */
export function afficherRejoindre(conteneur: HTMLElement, codeInitial: string | null, contexte: ContexteSalon): void {
  const { arrets, arrete } = preparerArret();

  const champ = el('input', {
    id: 'code-salon',
    type: 'text',
    class: 'champ-code',
    maxlength: '4',
    size: '4',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    'aria-describedby': 'code-aide',
  });
  const entrer = el('button', { type: 'submit', class: 'bouton', 'data-action': 'entrer' }, t('salon.entrer'));
  const statut = el('p', { role: 'status', class: 'etat-salon' });
  const message = el('p', { role: 'alert', class: 'erreur' });
  const form = el(
    'form',
    { class: 'parametres rejoindre' },
    el('label', { for: 'code-salon' }, t('salon.code')),
    champ,
    el('small', { id: 'code-aide' }, t('salon.saisirCode')),
    entrer,
    statut,
    message,
  );

  const rejoindre = async (): Promise<void> => {
    const code = normaliserCode(champ.value);
    message.textContent = '';
    message.removeAttribute('data-erreur');
    if (!code) {
      message.textContent = t('salon.codeInvalide');
      return;
    }
    champ.value = code;
    entrer.disabled = true;
    statut.textContent = t('salon.connexion');
    try {
      const canal = await contexte.acces.rejoindre(code);
      if (arrete()) return canal.fermer();
      const invite = await entrerDansLeSalon(canal, { joueur: moi(contexte), jeux: catalogue(contexte.registre) });
      if (arrete()) return invite.quitter();
      arrets.push(() => invite.quitter());
      salleInvite(conteneur, invite, code, contexte, arrets, arrete);
    } catch (erreur) {
      if (arrete()) return;
      statut.textContent = '';
      message.textContent = messageErreur(erreur);
      message.setAttribute('data-erreur', erreur instanceof ErreurReseau ? erreur.code : 'inconnue');
      entrer.disabled = false;
    }
  };
  form.addEventListener('submit', (evenement) => {
    evenement.preventDefault();
    if (!entrer.disabled) void rejoindre();
  });

  conteneur.replaceChildren(el('h1', {}, t('salon.rejoindre')), form, lienRetour());
  if (codeInitial) {
    champ.value = codeInitial;
    void rejoindre();
  }
}

/** Salle d'attente d'un invité, puis sa partie : il envoie ses coups et affiche sa vue. */
function salleInvite(
  conteneur: HTMLElement,
  invite: InviteReseau,
  code: string,
  contexte: ContexteSalon,
  arrets: (() => void)[],
  arrete: () => boolean,
): void {
  // L'hôte a vérifié que ce téléphone connaît le jeu, dans la même version (D-A1-08).
  const jeu = contexte.registre.trouver(invite.jeu.id)!;
  const compte = el('span', { class: 'compte-places', 'data-places': '' });
  const liste = el('ul', { class: 'joueurs-salon', 'aria-live': 'polite' });
  const maj = (participants: readonly Participant[]): void => {
    compte.textContent = t('salon.places', { n: participants.length, max: placesMax(jeu.fiche) });
    // Mêmes couleurs que celles que l'hôte donnera au lancement.
    const couleurs = couleursDistinctes(
      participants.map((p) => p.joueur.couleur),
      COULEURS,
    );
    liste.replaceChildren(
      ...participants.map((p, i) =>
        ligneJoueur({ ...p.joueur, couleur: couleurs[i]! }, p.id === 0 ? t('salon.hote') : p.id === invite.id ? t('salon.toi') : null),
      ),
    );
  };
  maj(invite.participants);
  arrets.push(invite.surParticipants(maj));

  conteneur.replaceChildren(
    titreJeu(jeu, contexte),
    el('p', { role: 'status' }, t('salon.attente', { code })),
    el('h2', {}, t('salon.joueurs'), ' ', compte),
    liste,
    el('div', { class: 'actions' }, el('a', { class: 'bouton bouton--discret', href: '#/jeux' }, t('salon.quitter'))),
  );

  let ecran: EcranAffiche | null = null;
  let finie = false;
  const abonnes = new Set<(vue: unknown) => void>();

  const monterEcran = (place: number): EcranAffiche => {
    const { joueurs } = lireDonneesLancement(invite.donneesLancement);
    const donnees: DonneesEcran<unknown, unknown> = {
      joueur: place,
      langue: contexte.langue,
      vue: () => invite.vue?.vue,
      surNouvelleVue(rappel) {
        abonnes.add(rappel);
        return () => abonnes.delete(rappel);
      },
      // L'hôte valide le coup ; l'invité ne fait jamais tourner les règles (D-A2-02).
      proposerCoup: (coup) => invite.proposerCoup(coup),
    };
    return afficherEcranPartie(conteneur, { jeu, donnees, noms: joueurs.map((j) => j.pseudo) }, contexte);
  };

  arrets.push(
    invite.surVue((recue) => {
      if (arrete()) return;
      if (!ecran && invite.place !== null) ecran = monterEcran(invite.place);
      for (const abonne of abonnes) abonne(recue.vue);
      if (recue.fin && !finie) {
        finie = true;
        ecran?.montrerFin(recue.fin);
      }
    }),
  );
  arrets.push(
    invite.surFermeture(() => {
      if (arrete() || finie) return;
      if (ecran) ecran.montrerMessage(t('salon.erreur.salon-ferme'));
      else {
        conteneur.replaceChildren(
          titreJeu(jeu, contexte),
          el('p', { role: 'alert', class: 'erreur', 'data-erreur': 'salon-ferme' }, t('salon.erreur.salon-ferme')),
          lienRetour(),
        );
      }
    }),
  );
  arrets.push(() => {
    abonnes.clear();
    ecran?.arreter();
  });
}
