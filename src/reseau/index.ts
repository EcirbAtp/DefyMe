/**
 * Réseau de DefyMe : salons en étoile autour de l'hôte, qui arbitre la partie.
 *
 * - `config` lit l'adresse du serveur dans un fichier distant (D-A3-08) ;
 * - `signalisation` parle au serveur de mise en relation (dossier `serveur/`) ;
 * - `webrtc` ouvre les canaux directs entre l'hôte et chaque invité ;
 * - `protocole`, `hote` et `invite` échangent des messages génériques,
 *   sans connaître aucun jeu (D-A3-13) ;
 * - `pont` relie l'hôte à la session de partie qui tourne sur son téléphone.
 */
export { paireDeCanaux, type Canal } from './canal';
export { lireConfigReseau, type ConfigReseau } from './config';
export { ErreurReseau, type CodeErreurReseau } from './erreurs';
export { HoteReseau, MAX_INVITES, type OptionsHote } from './hote';
export { entrerDansLeSalon, InviteReseau, type VueRecue } from './invite';
export { brancherPartie, type OptionsPont } from './pont';
export { PROTOCOLE, type CatalogueJeux, type JeuDuSalon, type Participant } from './protocole';
export { ouvrirSalon, rejoindreSalon, type SalonWebRTC } from './webrtc';
