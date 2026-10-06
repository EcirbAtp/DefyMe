/**
 * Erreurs du réseau, chacune avec un code que l'écran du salon traduira en
 * message clair (D-A3-09, D-A3-12).
 */
export type CodeErreurReseau =
  /** Le fichier qui donne l'adresse du serveur est absent ou illisible (D-A3-08). */
  | 'config-introuvable'
  /** Le serveur de mise en relation ne répond pas : panne ou quota gratuit du jour dépassé (D-A3-09). */
  | 'serveur-injoignable'
  /** Aucun salon ouvert avec ce code (D-A3-05). */
  | 'salon-introuvable'
  /** Le salon a déjà 7 invités (D-A3-11). */
  | 'salon-plein'
  /** L'hôte a refusé l'entrée : autre version de l'appli ou du jeu (D-A1-08). */
  | 'version-differente'
  /** L'hôte a refusé l'entrée : la partie a commencé. */
  | 'partie-lancee'
  /** La connexion directe entre les deux téléphones a échoué, sans relais en V1 (D-A3-12). */
  | 'connexion-directe-impossible'
  /** L'hôte a fermé le salon, ou la liaison avec lui est perdue. */
  | 'salon-ferme';

export class ErreurReseau extends Error {
  readonly code: CodeErreurReseau;

  constructor(code: CodeErreurReseau, detail?: string) {
    super(detail ? `${code} : ${detail}` : code);
    this.name = 'ErreurReseau';
    this.code = code;
  }
}
