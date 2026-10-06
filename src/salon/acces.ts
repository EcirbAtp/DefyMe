import { lireConfigReseau, ouvrirSalon, rejoindreSalon, type Canal, type ErreurReseau } from '../reseau';

/**
 * Accès au réseau pour les écrans de salon. En vrai : lecture de
 * `config-reseau.json` (D-A3-08), serveur de mise en relation et WebRTC.
 * Dans les tests, un faux serveur en mémoire le remplace.
 */
export interface SalonOuvert {
  code: string;
  /** Un invité vient d'ouvrir son canal direct vers l'hôte. */
  surCanal(rappel: (canal: Canal) => void): () => void;
  /** La liaison avec le serveur s'est coupée : plus personne ne peut entrer. */
  surFermeture(rappel: (erreur: ErreurReseau | null) => void): () => void;
  /** Ferme le salon au serveur : le code ne mène plus nulle part (D-A3-05). */
  fermer(): void;
}

export interface AccesReseau {
  ouvrir(): Promise<SalonOuvert>;
  rejoindre(code: string): Promise<Canal>;
}

/** L'accès réel : la configuration est relue à chaque salon, pour suivre un changement de serveur. */
export const accesReel: AccesReseau = {
  async ouvrir() {
    return ouvrirSalon(await lireConfigReseau());
  },
  async rejoindre(code) {
    return rejoindreSalon(await lireConfigReseau(), code);
  },
};
