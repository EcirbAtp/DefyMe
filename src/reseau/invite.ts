import type { Fin, Joueur } from '../noyau/contrat';
import { Ecouteurs, type Canal } from './canal';
import { ErreurReseau } from './erreurs';
import {
  PROTOCOLE,
  ecrireMessage,
  lireMessage,
  type CatalogueJeux,
  type JeuDuSalon,
  type MessageInvite,
  type Participant,
  type RaisonRefus,
} from './protocole';

/** Temps laissé à l'hôte pour répondre au bonjour. */
export const DELAI_ACCUEIL_MS = 10_000;

export interface VueRecue {
  vue: unknown;
  /** Place du joueur qui doit jouer. */
  tour: number;
  fin: Fin | null;
}

const ERREUR_DU_REFUS: Record<RaisonRefus, ErreurReseau['code']> = {
  'protocole-different': 'version-differente',
  'version-differente': 'version-differente',
  'salon-plein': 'salon-plein',
  'partie-lancee': 'partie-lancee',
};

/**
 * Entre dans le salon par un canal ouvert vers l'hôte : se présente avec
 * son pseudo et la liste de ses jeux, puis attend d'être accepté. Échoue
 * avec une `ErreurReseau` si l'hôte refuse (versions, salon plein) ou se tait.
 */
export function entrerDansLeSalon(
  canal: Canal,
  moi: { joueur: Joueur; jeux: CatalogueJeux },
  delaiMs = DELAI_ACCUEIL_MS,
): Promise<InviteReseau> {
  return new Promise((reussir, echouer) => {
    const finir = (erreur: ErreurReseau | null, invite?: InviteReseau) => {
      clearTimeout(delai);
      arreter();
      arreterFermeture();
      if (erreur) {
        canal.fermer();
        echouer(erreur);
      } else reussir(invite!);
    };
    const delai = setTimeout(() => finir(new ErreurReseau('salon-ferme', "l'hôte ne répond pas")), delaiMs);
    const arreterFermeture = canal.surFermeture(() => finir(new ErreurReseau('salon-ferme')));
    const arreter = canal.surMessage((texte) => {
      const message = lireMessage(texte);
      if (message?.type === 'refus') return finir(new ErreurReseau(ERREUR_DU_REFUS[message.raison] ?? 'salon-ferme'));
      if (message?.type === 'bienvenue') finir(null, new InviteReseau(canal, message.id, message.jeu));
    });
    canal.envoyer(ecrireMessage({ type: 'bonjour', protocole: PROTOCOLE, jeux: moi.jeux, joueur: moi.joueur }));
  });
}

/**
 * Le côté invité du réseau, une fois entré dans le salon. Il envoie ses
 * coups à l'hôte et reçoit sa vue de la partie ; il ne fait jamais tourner
 * les règles lui-même (D-A2-02).
 */
export class InviteReseau {
  readonly id: number;
  readonly jeu: JeuDuSalon;
  #canal: Canal;
  #participants: Participant[] = [];
  #place: number | null = null;
  #donneesLancement: unknown = undefined;
  #vue: VueRecue | null = null;
  #pings = new Map<number, { depart: number; reussir: (ms: number) => void }>();
  #prochainPing = 1;

  readonly #changements = new Ecouteurs<readonly Participant[]>();
  readonly #lancements = new Ecouteurs<{ place: number; donnees: unknown }>();
  readonly #vues = new Ecouteurs<VueRecue>();
  readonly #refus = new Ecouteurs<string>();
  readonly #fermetures = new Ecouteurs<void>();

  constructor(canal: Canal, id: number, jeu: JeuDuSalon) {
    this.#canal = canal;
    this.id = id;
    this.jeu = jeu;
    canal.surMessage((texte) => this.#recevoir(texte));
    canal.surFermeture(() => this.#fermetures.prevenir());
  }

  get participants(): readonly Participant[] {
    return this.#participants;
  }

  /** Place dans la partie, connue au lancement. */
  get place(): number | null {
    return this.#place;
  }

  get donneesLancement(): unknown {
    return this.#donneesLancement;
  }

  /** Dernière vue reçue de l'hôte. */
  get vue(): VueRecue | null {
    return this.#vue;
  }

  get connecte(): boolean {
    return this.#canal.ouvert;
  }

  #recevoir(texte: string): void {
    const message = lireMessage(texte);
    if (!message) return;
    switch (message.type) {
      case 'participants':
        this.#participants = message.liste;
        this.#changements.prevenir(message.liste);
        break;
      case 'lancer':
        this.#place = message.place;
        this.#donneesLancement = message.donnees;
        this.#lancements.prevenir({ place: message.place, donnees: message.donnees });
        break;
      case 'vue':
        this.#vue = { vue: message.vue, tour: message.tour, fin: message.fin };
        this.#vues.prevenir(this.#vue);
        break;
      case 'coup-refuse':
        this.#refus.prevenir(message.raison);
        break;
      case 'pong': {
        const ping = this.#pings.get(message.n);
        this.#pings.delete(message.n);
        ping?.reussir(performance.now() - ping.depart);
        break;
      }
      case 'fermeture':
        this.#canal.fermer();
        break;
    }
  }

  #envoyer(message: MessageInvite): void {
    if (this.#canal.ouvert) this.#canal.envoyer(ecrireMessage(message));
  }

  /** Propose un coup à l'hôte, qui le validera (D-A2-02). */
  proposerCoup(coup: unknown): void {
    this.#envoyer({ type: 'coup', coup });
  }

  /** Mesure l'aller-retour jusqu'à l'hôte, en millisecondes (D-A3-14). */
  mesurerDelai(delaiMaxMs = 5000): Promise<number> {
    const n = this.#prochainPing++;
    return new Promise((reussir, echouer) => {
      const delai = setTimeout(() => {
        this.#pings.delete(n);
        echouer(new ErreurReseau('salon-ferme', "pas de réponse de l'hôte"));
      }, delaiMaxMs);
      this.#pings.set(n, {
        depart: performance.now(),
        reussir: (ms) => {
          clearTimeout(delai);
          reussir(ms);
        },
      });
      this.#envoyer({ type: 'ping', n });
    });
  }

  quitter(): void {
    this.#envoyer({ type: 'quitter' });
    setTimeout(() => this.#canal.fermer(), 100);
  }

  surParticipants(rappel: (participants: readonly Participant[]) => void): () => void {
    return this.#changements.ajouter(rappel);
  }

  surLancement(rappel: (lancement: { place: number; donnees: unknown }) => void): () => void {
    return this.#lancements.ajouter(rappel);
  }

  surVue(rappel: (vue: VueRecue) => void): () => void {
    return this.#vues.ajouter(rappel);
  }

  surCoupRefuse(rappel: (raison: string) => void): () => void {
    return this.#refus.ajouter(rappel);
  }

  /** L'hôte a fermé le salon, ou la liaison est perdue. */
  surFermeture(rappel: () => void): () => void {
    return this.#fermetures.ajouter(rappel);
  }
}
