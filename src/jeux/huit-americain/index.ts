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
    // Version 2 : l'état garde les pseudos et couleurs des joueurs, pour l'écran.
    version: 2,
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
  variantes: [
    {
      cle: 'cartesParMain',
      nom: { fr: 'Cartes distribuées', en: 'Cards dealt' },
      choix: [5, 6, 7, 8, 10].map((n) => ({ valeur: n, nom: { fr: `${n} cartes`, en: `${n} cards` } })),
    },
    {
      cle: 'cumul',
      nom: { fr: 'Contrer un « pioche 2 » avec un autre', en: 'Stack “draw 2” cards' },
      choix: [
        { valeur: true, nom: { fr: 'Oui, les pénalités s’additionnent', en: 'Yes, penalties add up' } },
        { valeur: false, nom: { fr: 'Non', en: 'No' } },
      ],
    },
  ],
  etatInitial,
  joueurCourant: (etat) => etat.courant,
  coupsPermis,
  jouer,
  estFini,
  vuePour,
  ordinateur(etat, joueur, reflexion) {
    return choisirCoup(vuePour(etat, joueur), coupsPermis(etat, joueur), reflexion);
  },
  async ecran() {
    return (await import('./ecran')).EcranHuitAmericain;
  },
};

export default huitAmericain;
