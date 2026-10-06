import type { Jeu } from '../../noyau/contrat';
import { choisirCoup } from './ordinateur';
import { OPTIONS_PAR_DEFAUT, coupsPermis, estFini, etatInitial, jouer, vuePour, type Coup, type Etat, type Options, type Vue } from './regles';

/** Les Petits chevaux, de 2 à 4 joueurs (D-C-01). Nom générique, plateau original (D-B-03). */
const petitsChevaux: Jeu<Etat, Coup, Vue, Options> = {
  fiche: {
    id: 'petits-chevaux',
    version: 1,
    nom: { fr: 'Petits chevaux', en: 'Little Horses' },
    description: {
      fr: 'Lance le dé, sors tes chevaux et ramène-les tous au centre.',
      en: 'Roll the die, get your horses out and bring them all home.',
    },
    icone: '🐴',
    joueursMin: 2,
    joueursMax: 4,
    tempsReflexionMaxMs: 200,
  },
  optionsParDefaut: OPTIONS_PAR_DEFAUT,
  etatInitial,
  joueurCourant: (etat) => etat.courant,
  coupsPermis,
  jouer,
  estFini,
  vuePour,
  ordinateur: choisirCoup,
  async ecran() {
    return (await import('./ecran')).EcranPetitsChevaux;
  },
};

export default petitsChevaux;
