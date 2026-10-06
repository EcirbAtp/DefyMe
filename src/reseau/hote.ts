import type { Fin, Joueur } from '../noyau/contrat';
import { Ecouteurs, type Canal } from './canal';
import {
  PROTOCOLE,
  ecrireMessage,
  lireMessage,
  type JeuDuSalon,
  type MessageHote,
  type Participant,
  type RaisonRefus,
} from './protocole';

/** Invités au plus : l'hôte et 7 invités font les 8 joueurs d'un salon plein (D-A3-11). */
export const MAX_INVITES = 7;

/** Temps laissé à un invité pour se présenter, une fois le canal ouvert. */
export const DELAI_BONJOUR_MS = 10_000;

export interface OptionsHote {
  jeu: JeuDuSalon;
  joueur: Joueur;
  maxInvites?: number;
  delaiBonjourMs?: number;
}

/**
 * Le côté hôte du réseau, en étoile : chaque invité a son propre canal vers
 * l'hôte, et les invités ne se parlent jamais entre eux (D-A3-11).
 *
 * L'hôte vérifie les versions à l'entrée (D-A1-08), tient la liste des
 * participants, remonte les coups des invités et leur envoie ce qu'on lui
 * demande. Il ne connaît aucun jeu (D-A3-13) : c'est le pont (pont.ts) qui
 * relie ces messages à la session de partie.
 */
export class HoteReseau {
  readonly jeu: JeuDuSalon;
  readonly #maxInvites: number;
  readonly #delaiBonjourMs: number;
  readonly #moi: Participant;
  #invites = new Map<number, { canal: Canal; participant: Participant }>();
  #prochainId = 1;
  #verrouille = false;
  #ferme = false;

  readonly #changements = new Ecouteurs<readonly Participant[]>();
  readonly #departs = new Ecouteurs<Participant>();
  readonly #coups = new Ecouteurs<{ id: number; coup: unknown }>();

  constructor(options: OptionsHote) {
    this.jeu = { ...options.jeu };
    this.#maxInvites = Math.min(options.maxInvites ?? MAX_INVITES, MAX_INVITES);
    this.#delaiBonjourMs = options.delaiBonjourMs ?? DELAI_BONJOUR_MS;
    this.#moi = { id: 0, joueur: { ...options.joueur } };
  }

  /** L'hôte (identifiant 0) puis les invités, dans l'ordre d'arrivée. */
  get participants(): Participant[] {
    return [this.#moi, ...[...this.#invites.values()].map((i) => i.participant)];
  }

  /** Accueille un invité dont le canal vient de s'ouvrir. Il doit se présenter avant d'entrer. */
  accueillir(canal: Canal): void {
    if (this.#ferme) return canal.fermer();
    const delai = setTimeout(() => canal.fermer(), this.#delaiBonjourMs);
    const finAccueil = () => {
      clearTimeout(delai);
      arreter();
      arreterFermeture();
    };
    const arreterFermeture = canal.surFermeture(finAccueil);
    const arreter = canal.surMessage((texte) => {
      const message = lireMessage(texte);
      if (message?.type !== 'bonjour') return;
      finAccueil();
      const refus = this.#raisonRefus(message.protocole, message.jeux);
      if (refus) {
        envoyer(canal, { type: 'refus', raison: refus });
        setTimeout(() => canal.fermer(), 100);
        return;
      }
      this.#entrer(canal, message.joueur);
    });
  }

  #raisonRefus(protocole: number, jeux: Record<string, number>): RaisonRefus | null {
    if (protocole !== PROTOCOLE) return 'protocole-different';
    if (jeux[this.jeu.id] !== this.jeu.version) return 'version-differente';
    if (this.#verrouille) return 'partie-lancee';
    if (this.#invites.size >= this.#maxInvites) return 'salon-plein';
    return null;
  }

  #entrer(canal: Canal, joueur: Joueur): void {
    const participant: Participant = { id: this.#prochainId++, joueur: { pseudo: joueur.pseudo, couleur: joueur.couleur } };
    this.#invites.set(participant.id, { canal, participant });
    canal.surMessage((texte) => this.#recevoir(participant.id, texte));
    canal.surFermeture(() => this.#partir(participant.id));
    envoyer(canal, { type: 'bienvenue', id: participant.id, jeu: this.jeu });
    this.#annoncerParticipants();
  }

  #recevoir(id: number, texte: string): void {
    const invite = this.#invites.get(id);
    const message = lireMessage(texte);
    if (!invite || !message) return;
    switch (message.type) {
      case 'coup':
        this.#coups.prevenir({ id, coup: message.coup });
        break;
      case 'ping':
        envoyer(invite.canal, { type: 'pong', n: message.n });
        break;
      case 'quitter':
        invite.canal.fermer();
        break;
    }
  }

  #partir(id: number): void {
    const invite = this.#invites.get(id);
    if (!invite) return;
    this.#invites.delete(id);
    this.#departs.prevenir(invite.participant);
    this.#annoncerParticipants();
  }

  #annoncerParticipants(): void {
    const liste = this.participants;
    for (const { canal } of this.#invites.values()) envoyer(canal, { type: 'participants', liste });
    this.#changements.prevenir(liste);
  }

  /** La partie commence : plus personne n'entre. */
  verrouiller(): void {
    this.#verrouille = true;
  }

  /** Dit à un invité sa place dans la partie, avec des données de lancement opaques. */
  lancer(id: number, place: number, donnees: unknown): void {
    this.#envoyerA(id, { type: 'lancer', place, donnees });
  }

  /** Envoie à un invité sa vue de la partie, et rien d'autre (D-A2-03). */
  envoyerVue(id: number, vue: unknown, tour: number, fin: Fin | null): void {
    this.#envoyerA(id, { type: 'vue', vue, tour, fin });
  }

  refuserCoup(id: number, raison: string): void {
    this.#envoyerA(id, { type: 'coup-refuse', raison });
  }

  #envoyerA(id: number, message: MessageHote): void {
    const invite = this.#invites.get(id);
    if (invite) envoyer(invite.canal, message);
  }

  /** Prévient à chaque arrivée ou départ, avec la liste à jour. */
  surChangement(rappel: (participants: readonly Participant[]) => void): () => void {
    return this.#changements.ajouter(rappel);
  }

  surDepart(rappel: (participant: Participant) => void): () => void {
    return this.#departs.ajouter(rappel);
  }

  /** Coup proposé par un invité, à faire valider par la session (D-A2-02). */
  surCoup(rappel: (proposition: { id: number; coup: unknown }) => void): () => void {
    return this.#coups.ajouter(rappel);
  }

  /** Ferme le salon : chaque invité est prévenu puis déconnecté. */
  fermer(): void {
    if (this.#ferme) return;
    this.#ferme = true;
    const invites = [...this.#invites.values()];
    this.#invites.clear();
    for (const { canal } of invites) {
      envoyer(canal, { type: 'fermeture' });
      canal.fermer();
    }
    this.#changements.prevenir(this.participants);
  }
}

function envoyer(canal: Canal, message: MessageHote): void {
  if (canal.ouvert) canal.envoyer(ecrireMessage(message));
}
