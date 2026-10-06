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
  variantes: [
    {
      cle: 'rejouerSur6',
      nom: { fr: 'Un 6 fait rejouer', en: 'A 6 gives another turn' },
      choix: [
        { valeur: true, nom: { fr: 'Oui', en: 'Yes' } },
        { valeur: false, nom: { fr: 'Non', en: 'No' } },
      ],
    },
    {
      cle: 'surplus',
      nom: { fr: "Trop de points pour l'arrivée", en: 'Overshooting the finish square' },
      choix: [
        { valeur: 'recule', nom: { fr: 'Le cheval recule du surplus', en: 'The horse bounces back' } },
        { valeur: 'bloque', nom: { fr: 'Le cheval ne bouge pas', en: 'The horse cannot move' } },
      ],
    },
    {
      cle: 'escalier',
      nom: { fr: 'Escalier', en: 'Home stairs' },
      choix: [
        { valeur: 'chiffres', nom: { fr: 'Le chiffre de chaque marche (1, 2… 6)', en: 'Exact number of each step (1, 2… 6)' } },
        { valeur: 'libre', nom: { fr: 'Montée libre, centre atteint pile', en: 'Free climb, exact roll to the centre' } },
      ],
    },
    {
      cle: 'depassement',
      nom: { fr: 'Sauter par-dessus les chevaux', en: 'Jumping over horses' },
      choix: [
        { valeur: true, nom: { fr: 'Permis', en: 'Allowed' } },
        { valeur: false, nom: { fr: 'Interdit', en: 'Not allowed' } },
      ],
    },
    {
      cle: 'victoire',
      nom: { fr: 'Pour gagner', en: 'To win' },
      choix: [
        { valeur: 'tous', nom: { fr: 'Les 4 chevaux au centre', en: 'All 4 horses home' } },
        { valeur: 'premier', nom: { fr: 'Un seul cheval au centre (partie courte)', en: 'One horse home (short game)' } },
      ],
    },
  ],
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
