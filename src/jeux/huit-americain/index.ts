import type { Jeu } from '../../noyau/contrat';
import { choisirCoup } from './ordinateur';
import { OPTIONS_PAR_DEFAUT, coupsPermis, estFini, etatInitial, jouer, vuePour, type Coup, type Etat, type Options, type Vue } from './regles';

/**
 * Huit américain (D-C-02) : jeu de cartes à mains cachées, de 2 à 8 joueurs.
 * Règles dans regles.ts, ordinateur dans ordinateur.ts.
 */
const huitAmericain: Jeu<Etat, Coup, Vue, Options> = {
  fiche: {
    id: 'huit-americain',
    version: 1,
    nom: { fr: 'Huit américain', en: 'Crazy Eights' },
    description: {
      fr: 'Pose une carte de même couleur ou de même valeur. Le premier sans cartes gagne.',
      en: 'Play a card of the same suit or rank. First to empty their hand wins.',
    },
    icone: '🃏',
    joueursMin: 2,
    joueursMax: 8,
  },
  optionsParDefaut: OPTIONS_PAR_DEFAUT,
  etatInitial,
  joueurCourant: (etat) => etat.courant,
  coupsPermis,
  jouer,
  estFini,
  vuePour,
  ordinateur(etat, joueur, reflexion) {
    return choisirCoup(vuePour(etat, joueur), coupsPermis(etat, joueur), reflexion);
  },
  // L'écran arrive avec le mode un téléphone et le réseau (suite de l'étape 4).
  async ecran() {
    return class EcranHuitAmericain {};
  },
};

export default huitAmericain;
