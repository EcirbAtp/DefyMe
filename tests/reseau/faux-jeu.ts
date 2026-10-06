import type { Jeu } from '../../src/noyau/contrat';
import { Hasard } from '../../src/noyau/hasard';

/**
 * Faux jeu pour tester le réseau sans attendre les vrais jeux : chacun à son
 * tour avance un compteur de 1 ou 2 ; celui qui atteint la cible gagne.
 * Chaque joueur a aussi un secret, que lui seul doit voir : il sert à
 * vérifier que le réseau n'envoie à chacun que sa vue (D-A2-03).
 */
export type Etat = { compteur: number; cible: number; courant: number; secrets: number[]; gagnant: number | null };
export type Coup = { avancer: 1 | 2 };
export type Vue = { compteur: number; cible: number; courant: number; monSecret: number; nbJoueurs: number; gagnant: number | null };

export const fauxJeu: Jeu<Etat, Coup, Vue, { cible: number }> = {
  fiche: {
    id: 'faux-jeu',
    version: 1,
    nom: { fr: 'Faux jeu', en: 'Fake game' },
    description: { fr: 'Pour tester le réseau.', en: 'To test the network.' },
    icone: '🧪',
    joueursMin: 2,
    joueursMax: 8,
  },
  optionsParDefaut: { cible: 20 },
  etatInitial(joueurs, graine, options) {
    const h = new Hasard(graine);
    return {
      compteur: 0,
      cible: options.cible,
      courant: 0,
      secrets: joueurs.map(() => h.entier(1000, 9999)),
      gagnant: null,
    };
  },
  joueurCourant: (etat) => etat.courant,
  coupsPermis(etat, joueur) {
    if (etat.gagnant !== null || joueur !== etat.courant) return [];
    return etat.cible - etat.compteur >= 2 ? [{ avancer: 1 }, { avancer: 2 }] : [{ avancer: 1 }];
  },
  jouer(etat, joueur, coup) {
    const compteur = etat.compteur + coup.avancer;
    if (compteur >= etat.cible) return { ...etat, compteur, gagnant: joueur };
    return { ...etat, compteur, courant: (etat.courant + 1) % etat.secrets.length };
  },
  estFini: (etat) => (etat.gagnant === null ? null : { gagnants: [etat.gagnant] }),
  vuePour: (etat, joueur) => ({
    compteur: etat.compteur,
    cible: etat.cible,
    courant: etat.courant,
    monSecret: etat.secrets[joueur] ?? 0,
    nbJoueurs: etat.secrets.length,
    gagnant: etat.gagnant,
  }),
  ordinateur(etat, joueur, { graine }) {
    return new Hasard(graine).choisir(this.coupsPermis(etat, joueur));
  },
  async ecran() {
    return class {};
  },
};
