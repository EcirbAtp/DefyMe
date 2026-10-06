import { Ecouteurs } from './canal';
import { ErreurReseau, type CodeErreurReseau } from './erreurs';

/**
 * Client du serveur de mise en relation (dossier `serveur/`). Il ne sert
 * qu'à échanger les messages de connexion WebRTC ; la partie n'y passe
 * jamais (D-A3-06).
 */

export type TypeSignal = 'offre' | 'reponse' | 'candidat';

export interface Signal {
  type: TypeSignal;
  /** Invité d'où vient le signal (vu de l'hôte seulement). */
  de?: string;
  donnees: unknown;
}

/** Temps laissé au serveur pour accepter la connexion. */
export const DELAI_SERVEUR_MS = 8000;

/** Codes de fermeture envoyés par le serveur. */
const ERREUR_DU_CODE: Record<number, CodeErreurReseau> = {
  4000: 'salon-ferme',
  4003: 'salon-plein',
  4004: 'salon-introuvable',
};

/** Une connexion au serveur, côté hôte ou côté invité. */
export class LiaisonSignalisation {
  readonly #ws: WebSocket;
  readonly #signaux = new Ecouteurs<Signal>();
  readonly #arrivees = new Ecouteurs<string>();
  readonly #fermetures = new Ecouteurs<ErreurReseau | null>();
  #fermeVolontaire = false;

  private constructor(ws: WebSocket) {
    this.#ws = ws;
    ws.addEventListener('message', (e) => {
      let m: { type?: unknown; de?: unknown; donnees?: unknown; code?: unknown };
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m.type === 'arrivee' && typeof m.de === 'string') this.#arrivees.prevenir(m.de);
      else if (m.type === 'offre' || m.type === 'reponse' || m.type === 'candidat') {
        this.#signaux.prevenir({ type: m.type, de: typeof m.de === 'string' ? m.de : undefined, donnees: m.donnees });
      }
    });
    ws.addEventListener('close', (e) => {
      const code = ERREUR_DU_CODE[e.code];
      this.#fermetures.prevenir(this.#fermeVolontaire ? null : new ErreurReseau(code ?? 'serveur-injoignable', `fermeture ${e.code}`));
    });
  }

  /**
   * Ouvre un salon. Renvoie la liaison et le code à 4 caractères donné par
   * le serveur. Échoue avec « serveur-injoignable » si le serveur ne répond
   * pas : panne, ou quota gratuit du jour dépassé (D-A3-09).
   */
  static async ouvrirSalon(adresse: string, delaiMs = DELAI_SERVEUR_MS): Promise<{ liaison: LiaisonSignalisation; code: string }> {
    const ws = await connecter(`${adresse}/salon`, delaiMs);
    const code = await new Promise<string>((reussir, echouer) => {
      const delai = setTimeout(() => {
        ws.close();
        echouer(new ErreurReseau('serveur-injoignable', 'pas de code reçu'));
      }, delaiMs);
      ws.addEventListener('message', function lire(e) {
        try {
          const m = JSON.parse(String(e.data)) as { type?: unknown; code?: unknown };
          if (m.type !== 'salon' || typeof m.code !== 'string') return;
          clearTimeout(delai);
          ws.removeEventListener('message', lire);
          reussir(m.code);
        } catch {
          // message illisible : ignoré
        }
      });
    });
    return { liaison: new LiaisonSignalisation(ws), code };
  }

  /** Se connecte au salon de ce code, pour y négocier la connexion directe avec l'hôte. */
  static async rejoindre(adresse: string, code: string, delaiMs = DELAI_SERVEUR_MS): Promise<LiaisonSignalisation> {
    const propre = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(propre)) throw new ErreurReseau('salon-introuvable', 'code mal formé');
    return new LiaisonSignalisation(await connecter(`${adresse}/salon/${propre}`, delaiMs));
  }

  /** Envoie un signal. L'hôte précise à quel invité (`vers`). */
  envoyer(type: TypeSignal, donnees: unknown, vers?: string): void {
    if (this.#ws.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify({ type, vers, donnees }));
  }

  surSignal(rappel: (signal: Signal) => void): () => void {
    return this.#signaux.ajouter(rappel);
  }

  /** Côté hôte : un invité vient de se connecter au salon. */
  surArrivee(rappel: (id: string) => void): () => void {
    return this.#arrivees.ajouter(rappel);
  }

  /** La liaison s'est fermée : `null` si on l'a fermée soi-même, sinon la raison. */
  surFermeture(rappel: (erreur: ErreurReseau | null) => void): () => void {
    return this.#fermetures.ajouter(rappel);
  }

  fermer(): void {
    this.#fermeVolontaire = true;
    this.#ws.close(1000);
  }
}

function connecter(url: string, delaiMs: number): Promise<WebSocket> {
  return new Promise((reussir, echouer) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      return echouer(new ErreurReseau('serveur-injoignable', String(e)));
    }
    const delai = setTimeout(() => {
      ws.close();
      echouer(new ErreurReseau('serveur-injoignable', 'délai dépassé'));
    }, delaiMs);
    ws.addEventListener('open', () => {
      clearTimeout(delai);
      reussir(ws);
    });
    ws.addEventListener('close', (e) => {
      clearTimeout(delai);
      echouer(new ErreurReseau(ERREUR_DU_CODE[e.code] ?? 'serveur-injoignable', `fermeture ${e.code}`));
    });
  });
}
