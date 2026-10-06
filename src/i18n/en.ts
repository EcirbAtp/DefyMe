import type { CleTexte } from './fr';

/** English texts. Must contain exactly the same keys as fr.ts (checked by the compiler). */
export const en: Record<CleTexte, string> = {
  'app.titre': 'DefyMe',
  'nav.jeux': 'Games',
  'nav.parametres': 'Settings',

  'jeux.titre': 'Games',
  'jeux.vide': 'The first games are coming soon: Ludo, then Crazy Eights.',
  'jeux.joueurs': '{min} to {max} players',
  'jeux.joueursFixe': '{n} players',
  'jeux.bientot': "This game's screen is coming in a future version.",
  'jeux.retour': 'Back to games',

  'parametres.titre': 'Settings',
  'parametres.pseudo': 'Nickname',
  'parametres.pseudoAide': 'Shown to other players. 16 characters max.',
  'parametres.couleur': 'Colour',
  'parametres.couleurNom': 'Colour {n}',
  'parametres.son': 'Sound',
  'parametres.langue': 'Language',
  'parametres.enregistre': 'Saved on this phone.',
  'parametres.version': 'Version {version}',
  'parametres.vieprivee': 'No account, no data sent: your settings stay on this phone.',

  'installation.titre': 'Install the app',
  'installation.bouton': 'Install',
  'installation.fermer': 'Later',
  'installation.android': 'Add DefyMe to your home screen to open it like an app, even offline.',
  'installation.ios': 'On iPhone: tap the Safari Share button, then “Add to Home Screen”.',

  'hors-ligne.pret': 'Ready to work offline.',
  'mise-a-jour.dispo': 'A new version is available.',
  'mise-a-jour.bouton': 'Update',

  'joueur.parDefaut': 'Player',
};
