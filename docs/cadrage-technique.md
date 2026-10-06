# DefyMe – Cadrage technique

6 octobre 2026 · @fab

## En bref

Décision du 6 octobre 2026 : la V1 est une appli web installable (PWA),
gratuite et sans store. La V2 passera sur les stores pour les jeux solo et la
monétisation.

- **Stack** : TypeScript et Phaser, appli hébergée gratuitement sur GitHub Pages.
- **Salons** : le téléphone qui crée le salon arbitre la partie. Un petit
  serveur gratuit, à nous, présente les téléphones entre eux, puis la partie
  passe en direct (WebRTC). Un échange par QR code sans serveur sert de secours.
- **Architecture** : chaque jeu respecte un contrat de jeu commun, on en ajoute
  sans toucher au reste.
- **MVP** : Petits chevaux et Huit américain, plus un mode « un seul téléphone ».
- **Coût** : 0 € en V1 tant qu'on reste dans les offres gratuites. En V2 : 25 $
  une fois pour Google Play, 99 $/an et un Mac pour l'App Store.

## Stack retenue

La V1 est une appli web en TypeScript, installée depuis le navigateur ; la V2
reprendra le même code, emballé avec Capacitor pour Google Play et l'App Store.

| Brique | Choix | Pourquoi |
|---|---|---|
| Langage | TypeScript | Un seul langage pour l'appli, les jeux et le serveur de mise en relation |
| Affichage des jeux | Phaser 3 (gratuit) | Moteur 2D web : plateaux, cartes, animations, sons |
| Menus | HTML et CSS simples | Menu Jeux et Paramètres, légers et lisibles sur petit écran |
| Connexion entre téléphones | WebRTC direct, sans bibliothèque intermédiaire (PeerJS écarté) | Lien direct entre téléphones, sans faire passer la partie par un serveur ; moins de dépendances, et le protocole de mise en relation reste le nôtre |
| Mise en relation | Notre petit serveur, sur l'offre gratuite de Cloudflare Workers | Gratuit, et on garde la main dessus |
| Hébergement de l'appli | GitHub Pages | Gratuit, mises à jour instantanées |
| Hors ligne | Service worker de la PWA (vite-plugin-pwa) | L'appli s'ouvre sans réseau, le mode un seul téléphone marche partout |
| Tests | Vitest | Règles et réseau testés automatiquement, sans téléphone |
| V2 stores | Capacitor | Même code, avec accès aux fonctions natives (achats intégrés, découverte locale) |

Choix associés :

- Godot écarté pour la V1 : son export web est lourd et lent à charger sur mobile.
- Orientation portrait, interface pensée pour petits écrans dès le départ.
- Aucune donnée personnelle : un pseudo et une couleur, stockés sur le
  téléphone, suffisent.
- Téléphone de référence : iPhone X et ses équivalents Android (voir D-C-06).

## Salons sans serveur payant

Le téléphone qui crée le salon arbitre la partie. Un petit serveur gratuit ne
sert qu'à présenter les téléphones, puis la partie passe directement entre eux
(WebRTC).

1. L'hôte crée un salon : l'appli obtient un code court (par exemple K7Q2)
   auprès du serveur de mise en relation et l'affiche avec un QR code.
2. Les amis tapent le code ou scannent le QR code.
3. Le serveur fait passer les « coordonnées » réseau (quelques centaines
   d'octets) entre l'hôte et chaque joueur.
4. Chaque joueur se connecte directement à l'hôte, jusqu'à 8 joueurs reliés à lui.
5. Pendant la partie, les joueurs envoient leurs coups, l'hôte les vérifie et
   diffuse la nouvelle situation. Les cartes en main ne sont envoyées qu'à leur
   propriétaire.

### Serveur de mise en relation

- Le nôtre, sur une offre gratuite (Cloudflare Workers), plutôt qu'un serveur
  public tiers, pour garder la main.
- Un programme minuscule (une centaine de lignes), qu'on peut déménager chez un
  autre hébergeur en une heure.
- Son adresse est lue au démarrage dans un petit fichier hébergé avec l'appli
  (`config-reseau.json`) : changer de serveur ne demande pas de republier l'appli.
- Si le serveur tombe, les parties en cours continuent ; seuls les nouveaux
  salons sont bloqués.

**Secours sans serveur** : les coordonnées s'échangent par QR codes, deux scans
par joueur. C'est lourd, mais l'appli reste jouable quoi qu'il arrive.

### Limites à connaître

- Internet est nécessaire pour rejoindre un salon, pas pour jouer ensuite.
- **Réseaux difficiles.** Sur certains Wi-Fi publics, ou entre un téléphone en
  4G et un autre en Wi-Fi, la connexion directe peut échouer. Il faudrait alors
  un relais (TURN), payant au volume : non prévu en V1, l'appli affiche un
  message clair.
- **iPhone.** La PWA est suspendue dès que l'hôte quitte l'appli ou verrouille
  l'écran : la partie se met en pause. On garde l'écran allumé pendant la
  partie et on reprend quand l'hôte revient.
- **Installation sur iPhone** : par Safari, « Ajouter à l'écran d'accueil »,
  sans bouton automatique. L'appli doit l'expliquer.
- **Partage de connexion** : fonctionne s'il donne accès à Internet, mais un
  iPhone accepte souvent environ 5 appareils.

En V2, Capacitor permettra d'ajouter une vraie découverte des salons sur le
Wi-Fi local, sans Internet.

## Architecture modulaire des jeux

Ajouter un jeu = ajouter un dossier (`src/jeux/<id>/`) qui respecte le contrat
commun ; le menu, les salons et le réseau ne changent pas.

Trois couches : le réseau ne connaît aucun jeu, il transporte des messages
génériques (rejoindre, quitter, lancer, coup, état). Seule la session de
partie, sur le téléphone hôte, appelle les règles du jeu.

Le contrat de jeu commun est une interface TypeScript
([`src/noyau/contrat.ts`](../src/noyau/contrat.ts)) : la liste des fonctions
que chaque jeu doit fournir.

- **Fiche** : nom, icône, nombre de joueurs minimum et maximum, options
  (variantes de règles).
- **Règles pures**, sans graphisme : créer l'état initial à partir des joueurs
  et d'une graine aléatoire, lister les coups permis, appliquer un coup,
  détecter la fin. Hasard uniquement issu de la graine, état sérialisable.
- **Vue par joueur** : ce que chaque joueur a le droit de voir, pour que les
  mains adverses ne quittent jamais l'hôte.
- **Ordinateur** : 3 niveaux (facile, moyen, difficile), qui jouent parmi les
  coups permis.
- **Écran** : la scène Phaser qui affiche l'état et envoie les intentions de
  coup, avec ses images prises dans le thème actif.

Esquisse d'origine du contrat (la version à jour est dans le code) :

```ts
interface Jeu<Etat, Coup> {
    id: string;                      // "petits-chevaux"
    nom: string;
    joueursMin: number;
    joueursMax: number;
    etatInitial(joueurs: Joueur[], graine: number): Etat;
    coupsPermis(etat: Etat, joueur: number): Coup[];
    jouer(etat: Etat, coup: Coup): Etat;
    estFini(etat: Etat): boolean;
    vuePour(etat: Etat, joueur: number): unknown; // cache les mains adverses
    ecran: typeof Phaser.Scene;        // l'affichage du jeu
}
```

Chaque jeu est vérifié par `verifierJeu(jeu)`, qui doit renvoyer une liste vide.

**Bénéfices** : les règles se testent automatiquement sans téléphone, le mode
un seul téléphone et le mode réseau partagent le même code, et un numéro de
version du protocole et de chaque jeu, vérifié à l'entrée du salon, évite qu'un
joueur avec une vieille version rejoigne une partie incompatible.

## Découpage MVP

Le MVP prend Petits chevaux et Huit américain parce qu'à eux deux ils testent
tout ce qui compte : dés et pions, cartes cachées, et un salon plein à 8
joueurs. Les échecs ne se jouent qu'à deux et ne testeraient pas le réseau à 8.

1. Coquille PWA : menu Jeux, menu Paramètres (pseudo, son, langue français ou
   anglais), installation sur l'écran d'accueil, ouverture hors ligne, contrat
   de jeu commun.
2. Petits chevaux sur un seul téléphone, avec adversaires ordinateur : valide
   le contrat de jeu sans réseau.
3. Salons : serveur de mise en relation, code et QR code, hôte qui arbitre ;
   Petits chevaux en réseau à 4.
4. Huit américain en réseau : mains cachées, pioche mélangée par l'hôte, 2 à 8
   joueurs.
5. Départs en cours de partie : un ordinateur remplace le joueur parti ; pause
   et reprise si c'est l'hôte.
6. Secours par QR codes sans serveur.
7. Tests sur vrais téléphones.
8. Mise en ligne sur GitHub Pages (adresse github.io, gratuit).

Le détail est dans le [plan des étapes 2 à 8](plan-etapes-2-a-8.md).

Ensuite, dans cet ordre : dames et échecs (règles simples, mode un seul
téléphone immédiat), puis un jeu de type Monopoly sous un autre nom et avec un
plateau original, puis d'autres jeux de cartes (Uno-like, belote, tarot).

## V2 sur les stores (famille E)

La V2 emballe la PWA avec Capacitor pour Google Play et l'App Store ; c'est là
qu'arrivent les jeux solo et la monétisation. Rien dans la V1 ne la bloque, à
condition de garder les jeux séparés du noyau et les graphismes chargés par
thème.

| Évolution | Ce qui la prépare dès la V1 | Point d'attention |
|---|---|---|
| Publication sur les stores | Même code TypeScript, emballé par Capacitor | 25 $ une fois pour Google Play ; 99 $/an et un Mac pour l'App Store |
| Jeux solo 2D (type Hollow Knight) | Phaser gère les jeux de plateformes 2D ; un jeu solo est un module de plus | Projet bien plus lourd ; si Phaser est trop limité, on réévalue Godot pour ces jeux-là |
| Thèmes pour les jeux multi | Chaque jeu lit ses images, sons et couleurs dans un « pack de thème » | Achats obligatoirement via Google Play et l'App Store (15 à 30 % de commission) |
| Salons sans Internet | Le réseau est isolé dans le noyau | Plugin natif Capacitor pour la découverte sur le Wi-Fi local |
| Serveur de comptes | Le pseudo local devient un profil optionnel, sans casser le jeu sans compte | Fin de la gratuité totale : hébergement, RGPD, sauvegardes |
| Données bancaires | Ne jamais les stocker soi-même | Déléguer au paiement des stores ou à un prestataire comme Stripe |
| Sécurité | L'hôte valide déjà chaque coup et cache les mains | Côté serveur : HTTPS, authentification, mises à jour de sécurité |

## Décisions

Tranchées le 6 octobre 2026.

- **Plateforme** : PWA en V1, stores en V2 pour le solo et la monétisation.
- **Jeu de cartes du MVP** : Huit américain.
- **Connexion** : WebRTC direct, sans PeerJS.
- **Jeu à distance** : proposé en V1 « au mieux », sans relais payant ; message
  clair si la connexion directe échoue.
- **Joueur qui quitte** : un adversaire ordinateur prend sa place jusqu'à son
  retour. Si c'est l'hôte qui part, la partie se met en pause et reprend à son
  retour, car c'est son téléphone qui fait tourner la partie.
- **Adversaires ordinateur** : en V1, pour jouer seul et pour remplacer un
  joueur parti ; 3 niveaux (facile, moyen, difficile).
- **Téléphone de référence** : iPhone X et ses équivalents Android.
- **Noms et droits** : noms et plateaux originaux pour les jeux sous marque
  (Monopoly, Uno).
- **Langues** : français et anglais dès la V1.
- **Adresse de l'appli** : adresse github.io gratuite
  (<https://ecirbatp.github.io/DefyMe/>).
