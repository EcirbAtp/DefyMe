import { ErreurReseau } from './erreurs';

/**
 * Réglages réseau lus au moment d'ouvrir ou de rejoindre un salon, dans le
 * fichier `config-reseau.json` publié à côté de l'appli (D-A3-08). Il n'est
 * pas gardé hors ligne : changer l'adresse du serveur dans ce fichier suffit
 * à changer de serveur, sans republier l'appli.
 */
export interface ConfigReseau {
  /** Adresse du serveur de mise en relation : « wss://... ». */
  signalisation: string;
  /** Serveurs STUN, pour que deux téléphones trouvent leur adresse publique. Pas de relais TURN en V1 (D-A3-12). */
  stun: string[];
}

export const NOM_FICHIER_CONFIG = 'config-reseau.json';

/** Lit et vérifie le fichier de configuration. Échoue avec « config-introuvable ». */
export async function lireConfigReseau(
  url: string | URL = new URL(NOM_FICHIER_CONFIG, document.baseURI),
  chercher: typeof fetch = fetch,
): Promise<ConfigReseau> {
  let brut: unknown;
  try {
    const reponse = await chercher(url, { cache: 'no-store' });
    if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
    brut = await reponse.json();
  } catch (e) {
    throw new ErreurReseau('config-introuvable', String(e));
  }
  const config = brut as Partial<ConfigReseau> | null;
  if (typeof config?.signalisation !== 'string' || !adresseAutorisee(config.signalisation)) {
    throw new ErreurReseau('config-introuvable', 'adresse du serveur absente ou non chiffrée');
  }
  const stun = Array.isArray(config.stun) ? config.stun.filter((s): s is string => typeof s === 'string' && /^stuns?:/.test(s)) : [];
  return { signalisation: config.signalisation.replace(/\/+$/, ''), stun };
}

/** Connexions chiffrées seulement (D-T-01), sauf sur l'ordinateur lui-même pour les tests. */
function adresseAutorisee(adresse: string): boolean {
  try {
    const url = new URL(adresse);
    if (url.protocol === 'wss:') return true;
    return url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}
