# DefyMe

Appli de jeux de société entre amis : plusieurs jeux, jusqu'à 8 joueurs, sur
n'importe quel téléphone, sans compte. La V1 est une appli web installable
(PWA) publiée gratuitement sur GitHub Pages.

## Lancer en local

```bash
npm install
npm run dev        # appli sur http://localhost:5173/DefyMe/
npm test           # tests automatiques
npm run build      # version de production dans dist/
```

## Organisation

```
src/
  noyau/       contrat de jeu, registre, session de partie, hasard à graine
  jeux/<id>/   un dossier par jeu (index.ts exporte le jeu par défaut)
  ui/          menus Jeux et Paramètres (HTML et CSS simples)
  i18n/        textes français et anglais
  stockage/    réglages gardés sur le téléphone
tests/         tests automatiques (Vitest)
```

## Ajouter un jeu

1. Créer `src/jeux/<id>/index.ts` qui exporte par défaut un objet respectant
   l'interface `Jeu` de [`src/noyau/contrat.ts`](src/noyau/contrat.ts) :
   fiche, `etatInitial`, `joueurCourant`, `coupsPermis`, `jouer`, `estFini`,
   `vuePour`, `ordinateur` (niveaux 1 à 5) et `ecran`.
2. Écrire ses tests, dont `expect(verifierJeu(monJeu)).toEqual([])`, qui joue
   des parties complètes et contrôle le contrat (règles pures, état
   sérialisable, hasard issu de la graine, ordinateur dans les coups permis
   et dans le temps imparti).

Le jeu apparaît alors tout seul dans le menu Jeux : rien à modifier dans le
noyau. Le jeu d'exemple [`tests/exemples/allumettes.ts`](tests/exemples/allumettes.ts)
sert de modèle.

## Exigences

Chaque demande de fusion cite les exigences dérivées (D-…) qu'elle réalise.
La référence est le tableur des exigences du projet.
