/** Textes français de l'appli (DC-7, D-D-05). Toute nouvelle clé doit aussi être ajoutée dans en.ts. */
export const fr = {
  'app.titre': 'DefyMe',
  'nav.jeux': 'Jeux',
  'nav.parametres': 'Paramètres',

  'jeux.titre': 'Jeux',
  'jeux.vide': 'Les premiers jeux arrivent bientôt : Petits chevaux, puis Huit américain.',
  'jeux.joueurs': '{min} à {max} joueurs',
  'jeux.joueursFixe': '{n} joueurs',
  'jeux.retour': 'Retour aux jeux',

  'parametres.titre': 'Paramètres',
  'parametres.pseudo': 'Pseudo',
  'parametres.pseudoAide': 'Visible par les autres joueurs. 16 caractères au plus.',
  'parametres.couleur': 'Couleur',
  'parametres.couleurNom': 'Couleur {n}',
  'parametres.son': 'Son',
  'parametres.langue': 'Langue',
  'parametres.enregistre': 'Enregistré sur ce téléphone.',
  'parametres.version': 'Version {version}',
  'parametres.vieprivee': "Aucun compte, aucune donnée envoyée : tes réglages restent sur ce téléphone.",

  'installation.titre': "Installer l'appli",
  'installation.bouton': 'Installer',
  'installation.fermer': 'Plus tard',
  'installation.android': "Ajoute DefyMe à ton écran d'accueil pour l'ouvrir comme une appli, même sans réseau.",
  'installation.ios': "Sur iPhone : touche le bouton Partager de Safari, puis « Sur l'écran d'accueil ».",

  'hors-ligne.pret': 'Prêt à fonctionner sans réseau.',
  'mise-a-jour.dispo': 'Une nouvelle version est disponible.',
  'mise-a-jour.bouton': 'Mettre à jour',

  'joueur.parDefaut': 'Joueur',

  'partie.adversaires': 'Adversaires',
  'partie.adversairesN': '{n} ordinateur(s)',
  'partie.niveau': "Niveau de l'ordinateur",
  'partie.niveau1': 'Facile',
  'partie.niveau2': 'Moyen',
  'partie.niveau3': 'Difficile',
  'partie.variantes': 'Variantes de règles',
  'partie.jouer': 'Jouer',
  'partie.enCours': 'Une partie est en cours sur ce téléphone.',
  'partie.reprendre': 'Reprendre la partie',
  'partie.nouvelle': 'Nouvelle partie',
  'partie.quitter': 'Quitter',
  'partie.toi': 'Toi',
  'partie.ordinateur': 'Ordi {n}',
  'partie.gagne': 'Bravo, tu as gagné !',
  'partie.perdu': '{nom} a gagné. Tu feras mieux la prochaine fois !',
  'partie.rejouer': 'Rejouer',
  'partie.erreurEcran': "L'écran du jeu n'a pas pu s'ouvrir. Recharge la page.",
} as const;

export type CleTexte = keyof typeof fr;
