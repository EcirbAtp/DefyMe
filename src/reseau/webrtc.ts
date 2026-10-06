import { Ecouteurs, type Canal } from './canal';
import type { ConfigReseau } from './config';
import { ErreurReseau } from './erreurs';
import { LiaisonSignalisation, type Signal } from './signalisation';

/**
 * Connexions directes entre téléphones (WebRTC), en étoile autour de
 * l'hôte (D-A3-11). Le serveur de mise en relation ne sert qu'à les
 * établir ; une fois le canal ouvert, l'invité le quitte.
 *
 * WebRTC est utilisé directement, sans bibliothèque : il suffit de quelques
 * dizaines de lignes, et l'appli reste légère (D-C-07).
 */

/** Temps laissé à une connexion directe pour s'établir avant d'abandonner (D-A3-12). */
export const DELAI_CONNEXION_MS = 15_000;

const NOM_CANAL = 'defyme';

/** Canal de données WebRTC, vu comme un `Canal`. */
class CanalWebRTC implements Canal {
  readonly #pc: RTCPeerConnection;
  readonly #dc: RTCDataChannel;
  readonly #messages = new Ecouteurs<string>();
  readonly #fermeture = new Ecouteurs<void>();
  #ferme = false;

  constructor(pc: RTCPeerConnection, dc: RTCDataChannel) {
    this.#pc = pc;
    this.#dc = dc;
    dc.addEventListener('message', (e) => {
      if (typeof e.data === 'string') this.#messages.prevenir(e.data);
    });
    dc.addEventListener('close', () => this.fermer());
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.fermer();
    });
  }

  get ouvert(): boolean {
    return !this.#ferme && this.#dc.readyState === 'open';
  }

  envoyer(texte: string): void {
    if (!this.ouvert) throw new Error('Canal fermé');
    this.#dc.send(texte);
  }

  surMessage(rappel: (texte: string) => void): () => void {
    return this.#messages.ajouter(rappel);
  }

  surFermeture(rappel: () => void): () => void {
    return this.#fermeture.ajouter(rappel);
  }

  fermer(): void {
    if (this.#ferme) return;
    this.#ferme = true;
    this.#dc.close();
    this.#pc.close();
    this.#fermeture.prevenir();
  }
}

function nouvelleConnexion(config: ConfigReseau): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: config.stun.length ? [{ urls: config.stun }] : [] });
}

/** Le salon côté hôte : son code, et chaque invité qui réussit sa connexion directe. */
export interface SalonWebRTC {
  code: string;
  /** Appelé pour chaque invité dont le canal direct vient de s'ouvrir. */
  surCanal(rappel: (canal: Canal) => void): () => void;
  /** Le serveur a fermé la liaison : plus personne ne peut entrer, les invités déjà là restent. */
  surFermeture(rappel: (erreur: ErreurReseau | null) => void): () => void;
  /** Ferme le salon au serveur : le code ne mène plus nulle part (D-A3-05). */
  fermer(): void;
}

/**
 * Ouvre un salon : obtient un code du serveur, puis répond à chaque invité
 * qui se présente avec ce code jusqu'à ouvrir un canal direct avec lui.
 */
export async function ouvrirSalon(config: ConfigReseau): Promise<SalonWebRTC> {
  const { liaison, code } = await LiaisonSignalisation.ouvrirSalon(config.signalisation);
  const canaux = new Ecouteurs<Canal>();
  const enCours = new Map<string, RTCPeerConnection>();

  // Les signaux sont traités un par un : un candidat ne doit pas passer avant l'offre.
  let file = Promise.resolve();
  liaison.surSignal((signal) => {
    file = file.then(() => traiter(signal));
  });

  async function traiter(signal: Signal): Promise<void> {
    const de = signal.de;
    if (!de) return;
    try {
      if (signal.type === 'offre') {
        if (enCours.has(de)) return;
        const pc = nouvelleConnexion(config);
        enCours.set(de, pc);
        const abandon = setTimeout(() => {
          enCours.delete(de);
          pc.close();
        }, DELAI_CONNEXION_MS);
        pc.addEventListener('icecandidate', (e) => {
          if (e.candidate) liaison.envoyer('candidat', e.candidate.toJSON(), de);
        });
        pc.addEventListener('datachannel', (e) => {
          const dc = e.channel;
          const pret = () => {
            clearTimeout(abandon);
            enCours.delete(de);
            canaux.prevenir(new CanalWebRTC(pc, dc));
          };
          if (dc.readyState === 'open') pret();
          else dc.addEventListener('open', pret, { once: true });
        });
        await pc.setRemoteDescription(signal.donnees as RTCSessionDescriptionInit);
        await pc.setLocalDescription(await pc.createAnswer());
        liaison.envoyer('reponse', pc.localDescription?.toJSON(), de);
      } else if (signal.type === 'candidat') {
        await enCours.get(de)?.addIceCandidate(signal.donnees as RTCIceCandidateInit);
      }
    } catch {
      // Signal invalide : l'invité finira sur « connexion directe impossible ».
    }
  }

  return {
    code,
    surCanal: (rappel) => canaux.ajouter(rappel),
    surFermeture: (rappel) => liaison.surFermeture(rappel),
    fermer: () => {
      liaison.fermer();
      for (const pc of enCours.values()) pc.close();
      enCours.clear();
    },
  };
}

/**
 * Rejoint un salon par son code et ouvre un canal direct avec l'hôte.
 * Échoue avec une `ErreurReseau` : « salon-introuvable », « salon-plein »,
 * « serveur-injoignable », « salon-ferme » si l'hôte ne répond pas, ou
 * « connexion-directe-impossible » si les deux téléphones ne parviennent
 * pas à se joindre, par exemple 4G contre Wi-Fi sans relais (D-A3-12).
 */
export async function rejoindreSalon(config: ConfigReseau, code: string, delaiMs = DELAI_CONNEXION_MS): Promise<Canal> {
  const liaison = await LiaisonSignalisation.rejoindre(config.signalisation, code);
  const pc = nouvelleConnexion(config);
  const dc = pc.createDataChannel(NOM_CANAL, { ordered: true });
  let reponseRecue = false;

  return new Promise<Canal>((reussir, echouer) => {
    let fini = false;
    const finir = (erreur: ErreurReseau | null) => {
      if (fini) return;
      fini = true;
      clearTimeout(delai);
      liaison.fermer();
      if (erreur) {
        pc.close();
        echouer(erreur);
      } else reussir(new CanalWebRTC(pc, dc));
    };
    const delai = setTimeout(
      () => finir(new ErreurReseau(reponseRecue ? 'connexion-directe-impossible' : 'salon-ferme', 'délai dépassé')),
      delaiMs,
    );
    liaison.surFermeture((erreur) => erreur && finir(erreur));
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') finir(new ErreurReseau('connexion-directe-impossible'));
    });
    dc.addEventListener('open', () => finir(null), { once: true });
    pc.addEventListener('icecandidate', (e) => {
      if (e.candidate) liaison.envoyer('candidat', e.candidate.toJSON());
    });
    let file = Promise.resolve();
    liaison.surSignal((signal) => {
      file = file.then(() => traiter(signal));
    });
    async function traiter(signal: Signal): Promise<void> {
      try {
        if (signal.type === 'reponse') {
          reponseRecue = true;
          await pc.setRemoteDescription(signal.donnees as RTCSessionDescriptionInit);
        } else if (signal.type === 'candidat') {
          await pc.addIceCandidate(signal.donnees as RTCIceCandidateInit);
        }
      } catch {
        finir(new ErreurReseau('connexion-directe-impossible', 'signal invalide'));
      }
    }
    void (async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        liaison.envoyer('offre', pc.localDescription?.toJSON());
      } catch (e) {
        finir(new ErreurReseau('connexion-directe-impossible', String(e)));
      }
    })();
  });
}
