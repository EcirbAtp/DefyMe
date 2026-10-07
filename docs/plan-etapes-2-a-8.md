# DefyMe – Plan des étapes 2 à 8

6 octobre 2026 · @fab

Après l'étape 1, le travail se sépare en deux pistes parallèles, les jeux et le
réseau, qui se rejoignent à l'étape 3. Une partie de l'étape 8 (mise en ligne
automatique, « 8a ») est avancée juste après l'étape 1 : le serveur, le scan de
QR code et les tests sur téléphone ont besoin d'une adresse HTTPS.

Les exigences citées (D-…) sont celles du tableur
[`DefyMe_exigences_V1.xlsx`](DefyMe_exigences_V1.xlsx), onglet Exigences. Seul
fab passe une exigence à « Fait », après l'avoir vérifiée lui-même.

## Vue d'ensemble

```
Étape 1 (coquille, contrat)
 ├─ 8a  mise en ligne automatique
 ├─ 2   Petits chevaux sur un téléphone
 ├─ 3   salons (serveur + couche réseau)  ──┐
 └─ 4   règles et ordinateur du Huit américain
                                            │
        3 ──► 4 (réseau)   3 ──► 5   3 ──► 6
        3, 4, 5, 6, 8a ──► 7 ──► 8b (version 1.0)
```

Les blocs sous l'étape 1 peuvent avancer en même temps, dans des fils séparés.
Le chemin le plus long passe par 1, 3, 5, 7 puis 8b : c'est lui qui fixe la
date de la version 1.0, et l'étape 7 attend surtout des téléphones réels.

## Étape 2 : Petits chevaux sur un seul téléphone

**Objectif.** Un premier jeu complet, jouable seul contre 1 à 3 ordinateurs,
qui valide le contrat de jeu et le moteur de partie sans réseau.

**Exigences couvertes.** D-C-01 (Petits chevaux, 2 à 4), D-A1-03 (règles pures
testées), D-A1-06 et D-A2-07 (mode un téléphone), D-A1-07 (graine), D-A2-08 et
D-A2-09 (ordinateur, 3 niveaux, temps plafonné), D-A1-09, D-B-01, D-B-03 (pack
de thème par défaut, plateau original), D-C-04 (portrait, une main), D-D-09
(sauvegarde à chaque coup), D-T-04 (tests des règles).

**Dépend de.** Étape 1 : contrat, registre, hasard à graine, coquille.

**En parallèle.** Les règles et l'ordinateur du Huit américain (début de
l'étape 4), et le cœur réseau de l'étape 3, qui peut se tester avec un faux jeu.

**Fin quand.** Une partie se joue de bout en bout contre les 3 niveaux
d'ordinateur, chacun proche de son taux de victoire visé ; les tests de règles
passent ; une partie rejouée avec la même graine et les mêmes coups donne le
même résultat ; une partie fermée puis rouverte reprend au même coup.

**Ce qu'il faut de fab.** Rien d'obligatoire. Jouer une partie sur ton
téléphone pour valider les règles.

## Étape 3 : salons et Petits chevaux en réseau

**Objectif.** Créer un salon, le rejoindre par code ou QR code, et jouer aux
Petits chevaux à 4 téléphones, l'hôte arbitrant la partie.

**Exigences couvertes.** D-A3-01 à D-A3-04 (salon, code, QR, liste des
joueurs, lancement), D-A3-05 (code à usage unique), D-A3-06 à D-A3-09 (serveur
de mise en relation minuscule, adresse dans un fichier distant, offre
gratuite), D-A3-11 à D-A3-14 (étoile, message clair en cas d'échec, messages
génériques, délai), D-A1-08 (versions vérifiées à l'entrée), D-A2-02 (l'hôte
valide chaque coup), D-A2-03 (chaque joueur reçoit sa vue), D-T-01, D-T-03.

**Dépend de.** Étape 1 pour la coquille ; étape 2 pour le jeu à brancher ; la
mise en ligne automatique (8a) pour héberger le fichier qui donne l'adresse du
serveur et pour tester sur téléphone en HTTPS.

**En parallèle.** Deux morceaux indépendants : le serveur de mise en relation
(Cloudflare Workers) et la couche réseau de l'appli (WebRTC direct, sans
PeerJS), testée d'abord avec un faux jeu pendant que l'étape 2 avance.

**Fin quand.** 4 joueurs (onglets ou téléphones) rejoignent par code et par QR
et finissent une partie ; une version différente est refusée à l'entrée ;
changer l'adresse dans le fichier distant suffit à changer de serveur ; le
serveur ne voit passer que les messages de connexion.

**Ce qu'il faut de fab.** Un compte Cloudflare gratuit. Pour que la mise en
ligne du serveur soit automatique, un jeton d'accès Cloudflare enregistré comme
secret du dépôt GitHub ; sinon tu lances toi-même une commande de déploiement
que je te donne. Le PC et l'iPhone pour un premier essai réel.

## Étape 4 : Huit américain en réseau

**Objectif.** Le jeu de cartes à mains cachées, de 2 à 8 joueurs, qui remplit
un salon complet.

**Exigences couvertes.** D-C-02 (Huit américain, 2 à 8), D-A2-01 (8 joueurs,
humains et ordinateurs), D-A2-03 (mains cachées), D-A1-07 (pioche mélangée par
l'hôte depuis la graine), D-A2-08 et D-A2-09 pour ce jeu, D-A3-11 (7 invités),
D-A1-05 (ajout sans toucher au noyau, vérifié ici sur un 2e jeu).

**Dépend de.** Étape 1 pour les règles et l'ordinateur ; étape 3 pour le jeu
en réseau.

**En parallèle.** Les règles, l'ordinateur et le mode un téléphone peuvent
démarrer dès la fin de l'étape 1, en même temps que l'étape 2. Seul le
branchement réseau attend l'étape 3. Découpage retenu : 4a règles et
ordinateur, 4b écran et mode un téléphone, 4c branchement réseau.

**Fin quand.** Une partie à 8 (humains et ordinateurs mélangés) va jusqu'au
bout ; un test vérifie qu'aucun message envoyé à un joueur ne contient la main
d'un autre ; ajouter ce jeu n'a modifié aucun fichier du noyau.

**Ce qu'il faut de fab.** Valider la variante de règles (cartes spéciales),
voir Points à trancher.

## Étape 5 : départs en cours de partie

**Objectif.** Une partie survit au départ d'un joueur : un ordinateur remplace
l'invité parti jusqu'à son retour, et la partie se met en pause si c'est l'hôte.

**Exigences couvertes.** D-A2-04 (invité remplacé par un ordinateur), D-A2-05
(hôte parti : pause et reprise), D-A2-06 (écran de l'hôte gardé allumé),
D-A2-10 (le remplaçant joue sans bloquer le tour), D-D-09 (sauvegarde à chaque
coup, utilisée pour la reprise), D-A3-05 (code invalidé à la fermeture du
salon).

**Dépend de.** Étape 3 (salons). L'étape 4 est utile pour vérifier la reprise
avec des mains cachées, mais pas bloquante.

**En parallèle.** Étape 6, et la fin de l'étape 4.

**Fin quand.** Un invité qui ferme l'appli est remplacé au tour suivant, puis
retrouve sa place et sa main en revenant ; l'hôte qui ferme l'appli met tout le
monde en pause, et la partie reprend au même coup à sa réouverture.

**Ce qu'il faut de fab.** Un iPhone pour vérifier le cas où l'hôte verrouille
l'écran : Safari suspend la page, et ce comportement ne se simule pas sur
ordinateur. Ce test peut aussi se faire à l'étape 7.

## Étape 6 : secours par QR codes

**Objectif.** Pouvoir lancer une partie en réseau même si le serveur de mise en
relation est indisponible, en échangeant les coordonnées par QR codes.

**Exigences couvertes.** D-A3-10 (mode de secours sans serveur), D-A3-09
(message clair quand le serveur ne répond pas, avec la proposition du secours).

**Dépend de.** Étape 3 : le secours remplace seulement la mise en relation, le
reste du réseau est réutilisé.

**En parallèle.** Étapes 4 et 5.

**Fin quand.** Serveur coupé, 3 téléphones lancent une partie par échange de QR
codes (deux scans par invité). Point technique à vérifier : les coordonnées
WebRTC pèsent quelques centaines d'octets, il faudra peut-être les compresser
pour que le QR code reste lisible.

**Ce qu'il faut de fab.** Au moins 2 appareils avec caméra pour l'essai final
(par exemple le PC avec webcam et l'iPhone). Le scan utilise la caméra du
navigateur, qui exige l'adresse HTTPS mise en ligne.

## Étape 7 : tests sur vrais téléphones

**Objectif.** Vérifier sur de vrais appareils et réseaux tout ce qui ne se
vérifie pas par test automatique, puis corriger ce qui casse.

**Exigences couvertes.** D-C-05 (Android Chrome et iPhone Safari), D-C-06 (30
images/s sur le téléphone de référence : iPhone X et ses équivalents Android),
D-C-04 (ergonomie à une main), D-A3-14 (délai sous 200 ms en Wi-Fi local),
D-A3-12 (échec en 4G contre Wi-Fi : message clair), D-D-06 (installation sur
l'écran d'accueil, consigne Safari), D-D-04 (langue du téléphone), D-A2-06
(écran gardé allumé), et toutes les exigences vérifiées « M » (manipulation)
dans le tableur.

**Dépend de.** Étapes 3 à 6 et la mise en ligne automatique. Des essais rapides
sur téléphone peuvent avoir lieu dès l'étape 2.

**En parallèle.** Les corrections trouvées pendant les tests.

**Fin quand.** Une grille de tests (appareil, réseau, scénario, résultat) est
remplie, chaque exigence « M » a un résultat, et les défauts bloquants sont
corrigés.

**Ce qu'il faut de fab.** C'est l'étape qui dépend le plus de toi, car Claude
ne peut pas manipuler de téléphone :

- un iPhone sous Safari (téléphone de référence : iPhone X ou plus récent) et,
  si possible, un Android équivalent sous Chrome ;
- une box Wi-Fi, un partage de connexion, et un téléphone en 4G ;
- idéalement 8 téléphones réunis une fois (amis, famille) pour un salon plein
  au Huit américain ; à défaut, PC + iPhone + robots (voir plus bas) ;
- ton temps pour dérouler la grille préparée et renvoyer les résultats et
  captures d'écran.

## Étape 8 : mise en ligne

**Objectif.** L'appli est publiée à son adresse github.io
(<https://ecirbatp.github.io/DefyMe/>), automatiquement à chaque fusion, et
seulement si les tests passent.

Elle est coupée en deux :

- **8a**, juste après l'étape 1 : la mise en ligne automatique sur GitHub Pages
  avec blocage si un test échoue. Elle sert dès l'étape 3 (le fichier qui donne
  l'adresse du serveur est hébergé avec l'appli), l'étape 6 (la caméra exige
  HTTPS) et l'étape 7 (les téléphones ouvrent l'adresse publique). Une PWA ne
  s'installe et ne marche hors ligne qu'en HTTPS. *Réalisée ; adresse confirmée
  par fab le 6 octobre 2026.*
- **8b**, à la fin : la publication de la version 1.0, après l'étape 7.

**Exigences couvertes.** D-T-05 (adresse github.io), D-T-04 (échec d'un test =
pas de mise en ligne), D-T-03 (coût 0 €), D-T-01 (HTTPS), D-C-07 (chargement
initial sous 5 Mo, vérifié à chaque publication), D-D-07 (hors ligne après la
première visite).

**Dépend de.** 8a : étape 1. 8b : toutes les autres.

**Fin quand.** 8a : une fusion sur main publie l'appli en quelques minutes, et
une fusion avec un test rouge ne publie rien. 8b : la version 1.0 est en ligne,
le tableur des exigences a un statut pour chaque ligne MVP.

## Tester le multijoueur sans autres joueurs

fab teste sur son PC et son iPhone. Décision du 6 octobre 2026 : le multijoueur
se vérifie de trois façons, qui remplacent en partie les vrais téléphones de
l'étape 7.

| Façon | Ce que c'est | À partir de |
|---|---|---|
| Robots dans le salon | Le créateur du salon remplit les places vides avec des robots, que son appareil fait jouer. Exemple : PC + iPhone + 6 robots. | Étape 3 |
| Plusieurs onglets | Chaque onglet ou fenêtre du PC compte comme un joueur distinct. | Étape 3 |
| Agents de test automatiques | À chaque pull request, un script ouvre jusqu'à 8 navigateurs invisibles qui rejoignent un salon (serveur lancé en local), jouent une partie complète et vérifient que tous voient le même plateau. | Étape 3 |

En bonus, un agent Claude peut rejoindre en direct un salon ouvert par fab, avec
son pseudo, s'il tourne sur le PC de fab. Depuis le cloud, c'est impossible :
les connexions directes (UDP) y sont bloquées, d'après un test du 6 octobre, et
la V1 n'a pas de relais.

## Ce qu'il faut de fab

Claude peut tout coder et tester sur ordinateur ; ces points-là ne peuvent
venir que de toi.

| Quand | Quoi |
|---|---|
| Avant 8a | Activer GitHub Pages (source « GitHub Actions ») — *fait* ; exiger les vérifications (« Require status checks to pass ») dans la règle de main |
| Avant le premier essai réseau réel | Créer un compte Cloudflare gratuit ; ajouter un jeton Cloudflare en secret du dépôt, ou déployer le serveur toi-même |
| Étapes 2 et 4 | Valider les variantes de règles des deux jeux |
| Étapes 3, 5 et 6 | PC et iPhone pour des essais rapides, dont l'iPhone pour la pause de l'hôte |
| Étape 7 | iPhone sous Safari, Android équivalent si possible, box Wi-Fi, partage de connexion, téléphone en 4G, idéalement 8 téléphones réunis une fois |
| À chaque étape | Relire et fusionner la pull request ; jouer soi-même avant de passer une exigence à « Fait » |

## Points tranchés

- **Mise en ligne automatique (8a) avancée juste après l'étape 1** : faite.
- **Connexion** : WebRTC direct, sans PeerJS.
- **Téléphone de référence** : l'iPhone X et ses équivalents Android remplacent
  le Galaxy J7 (certains J7 n'ont plus de Chrome à jour). D-C-06 est mis à jour
  en conséquence dans le tableur.
- **Niveaux d'ordinateur** : 3 niveaux pour commencer (facile, moyen,
  difficile), visant environ 20 %, 50 % et 80 % de victoires, mesurés par
  simulation. Si le hasard du jeu rend le taux visé impossible, on retient le
  meilleur taux atteignable. Mesures actuelles : Petits chevaux 20 %, 50 %,
  68 % ; Huit américain environ 40 %, 50 %, 69 % (limités par le hasard).

## Points à trancher

- **Variantes des Petits chevaux** : faut-il un 6 pour sortir un pion,
  rejoue-t-on après un 6, faut-il tomber pile sur la case d'arrivée ? Par
  défaut, les règles les plus courantes en France, modifiables dans les options
  du jeu.
- **Variante du Huit américain** : quelles cartes spéciales (8 change la
  couleur, 2 fait piocher, valet saute un tour, etc.). Par défaut, la variante
  la plus répandue, en option. Autre possibilité : l'utilisateur affecte les
  spécialités aux cartes.
