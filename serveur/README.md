# Serveur de mise en relation

Le petit serveur qui présente les téléphones entre eux avant une partie en
réseau. Il tourne sur l'offre gratuite de Cloudflare Workers.

## Ce qu'il fait, et ce qu'il ne fait pas

1. L'hôte ouvre `wss://…/salon` : le serveur lui donne un code de 4
   caractères (sans 0, O, 1, I ni L), valable tant que l'hôte reste connecté.
2. Un invité ouvre `wss://…/salon/CODE` : le serveur prévient l'hôte, puis fait
   passer leurs messages de connexion WebRTC (offre, réponse, candidats).
3. Une fois le canal direct ouvert, l'invité se déconnecte du serveur. La
   partie passe uniquement entre les téléphones.

Il refuse tout autre message, et tout message de plus de 8 Ko (D-A3-06). Un
salon accepte au plus 7 invités connectés en même temps au serveur ; c'est
l'hôte qui tient le compte final des 7 places (D-A3-11). Quand l'hôte se déconnecte, le
salon ferme et son code ne mène plus nulle part (D-A3-05).

Refus envoyés au navigateur, sous forme de code de fermeture de la
WebSocket : 4004 salon introuvable, 4003 salon plein, 4000 salon fermé.

Tout le code tient dans [`src/index.ts`](src/index.ts) (D-A3-07). Un salon est
un Durable Object nommé par son code, avec des WebSockets en hibernation :
rien n'est facturé pendant les silences, ce qui garde le serveur dans l'offre
gratuite (D-A3-09).

## Tester en local

```bash
cd serveur
npm install
npm test        # serveur dans le moteur de Cloudflare + onglets en vrai WebRTC (salons de l'appli compris)
npm run dev     # serveur local sur ws://localhost:8787
```

Les tests n'ont besoin ni de compte Cloudflare ni d'Internet. Le test
navigateur utilise Chromium (`npx playwright-core install chromium`).

## Mettre en ligne

Il faut un compte Cloudflare gratuit.

```bash
cd serveur
npx wrangler login     # une fois
npm run deploy
```

Wrangler affiche l'adresse du serveur, du type
`https://defyme-mise-en-relation.<ton-compte>.workers.dev`. Il reste à la
recopier dans [`public/config-reseau.json`](../public/config-reseau.json), en
remplaçant `https` par `wss` :

```json
{ "signalisation": "wss://defyme-mise-en-relation.<ton-compte>.workers.dev", "stun": ["stun:stun.cloudflare.com:3478"] }
```

L'appli lit ce fichier à chaque ouverture ou entrée de salon, sans le garder
hors ligne (D-A3-08) : pour changer de serveur, il suffit de modifier ce
fichier, sans toucher au code de l'appli.

## Déménager

Le serveur n'utilise que des WebSockets et un objet par salon. Pour changer
d'hébergeur, il faut réécrire `src/index.ts` avec l'équivalent local (une
table code → connexions), puis changer l'adresse dans `config-reseau.json`.
