/**
 * La vraie appli (menus, salons, réseau WebRTC), chargée dans un onglet de
 * navigateur invisible qui joue le rôle d'un téléphone. Seul l'écran Phaser
 * est remplacé par un écran qui joue tout seul le premier coup permis.
 * Paramètres de l'adresse : `version` (pour simuler une autre version du jeu).
 */
import petitsChevaux from '../../../src/jeux/petits-chevaux';
import type { Vue } from '../../../src/jeux/petits-chevaux/regles';
import type { DonneesEcran, JeuQuelconque } from '../../../src/noyau/contrat';
import type { Registre } from '../../../src/noyau/registre';
import { stockageDuNavigateur } from '../../../src/stockage/reglages';
import { demarrerAppli } from '../../../src/ui/app';
import type { Monteur } from '../../../src/ui/partie';

const version = Number(new URLSearchParams(location.search).get('version') ?? petitsChevaux.fiche.version);
const jeu: JeuQuelconque = { ...petitsChevaux, fiche: { ...petitsChevaux.fiche, version } };
const registre: Registre = { lister: () => [jeu], trouver: (id) => (id === jeu.fiche.id ? jeu : undefined) };

let ecran: DonneesEcran<Vue, unknown> | null = null;
let coupsProposes = 0;

const monter: Monteur = async (_zone, _charger, brutes) => {
  const donnees = brutes as DonneesEcran<Vue, unknown>;
  ecran = donnees;
  let actif = true;
  const jouer = (vue: Vue) => {
    if (!actif || vue.gagnant !== null || vue.courant !== donnees.joueur) return;
    const coup = jeu.coupsPermis({ ...vue, hasard: 0 }, donnees.joueur)[0];
    setTimeout(() => {
      if (!actif) return;
      coupsProposes++;
      donnees.proposerCoup(coup);
    });
  };
  const desabonner = donnees.surNouvelleVue(jouer);
  jouer(donnees.vue());
  return () => {
    actif = false;
    desabonner();
  };
};

const racine = document.createElement('div');
racine.id = 'appli';
document.body.append(racine);
demarrerAppli(racine, {
  registre,
  stockage: stockageDuNavigateur(),
  langueDuTelephone: 'fr',
  version: 'essai',
  monterEcran: monter,
  pauseOrdinateurMs: 5,
});

const essaiAppli = {
  /** Place et dernière vue de l'écran de jeu de ce téléphone. */
  ecran: () => (ecran ? { joueur: ecran.joueur, vue: ecran.vue() } : null),
  coupsProposes: () => coupsProposes,
};
Object.assign(window, { essaiAppli });
export type EssaiAppli = typeof essaiAppli;
