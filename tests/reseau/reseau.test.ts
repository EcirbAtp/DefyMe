import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Joueur } from '../../src/noyau/contrat';
import { SessionDePartie, type Place } from '../../src/noyau/session';
import { verifierJeu } from '../../src/noyau/verification';
import {
  ErreurReseau,
  HoteReseau,
  PROTOCOLE,
  brancherPartie,
  entrerDansLeSalon,
  lireConfigReseau,
  paireDeCanaux,
  type CatalogueJeux,
} from '../../src/reseau';
import { lireMessage } from '../../src/reseau/protocole';
import { fauxJeu, type Vue } from './faux-jeu';

const joueur = (pseudo: string): Joueur => ({ pseudo, couleur: '#1e88e5' });
const MES_JEUX: CatalogueJeux = { 'faux-jeu': 1, autre: 3 };

function nouvelHote() {
  return new HoteReseau({ jeu: { id: 'faux-jeu', version: 1 }, joueur: joueur('Hôte') });
}

/** Relie un invité à l'hôte par une paire de canaux en mémoire, en gardant tout ce qu'il reçoit. */
async function inviter(hote: HoteReseau, pseudo: string, jeux: CatalogueJeux = MES_JEUX) {
  const [cote, chezInvite] = paireDeCanaux();
  const recus: string[] = [];
  chezInvite.surMessage((t) => recus.push(t));
  hote.accueillir(cote);
  const invite = await entrerDansLeSalon(chezInvite, { joueur: joueur(pseudo), jeux });
  return { invite, recus, canal: chezInvite };
}

const attendre = async (condition: () => boolean, ms = 2000) => {
  const fin = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > fin) throw new Error('Délai dépassé');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('faux jeu de test', () => {
  it('respecte le contrat de jeu', () => {
    expect(verifierJeu(fauxJeu)).toEqual([]);
  });
});

describe('messages génériques (D-A3-13)', () => {
  it('ignore tout ce qui n’est pas un message connu et bien formé', () => {
    expect(lireMessage('{"type":"coup","coup":{"avancer":1}}')).toEqual({ type: 'coup', coup: { avancer: 1 } });
    expect(lireMessage('pas du json')).toBeNull();
    expect(lireMessage('{"type":"inconnu"}')).toBeNull();
    expect(lireMessage('{"type":"toString"}')).toBeNull();
    expect(lireMessage('{"type":"bienvenue","id":"1"}')).toBeNull();
    expect(lireMessage('{"type":"bonjour","protocole":1,"jeux":{},"joueur":{"pseudo":"' + 'x'.repeat(50) + '","couleur":"#000"}}')).toBeNull();
    expect(lireMessage(JSON.stringify({ type: 'coup', coup: 'x'.repeat(70_000) }))).toBeNull();
    expect(lireMessage(42)).toBeNull();
  });

  it('le réseau n’importe aucun jeu', () => {
    const dossier = join(process.cwd(), 'src/reseau');
    for (const fichier of readdirSync(dossier)) {
      const source = readFileSync(join(dossier, fichier), 'utf8');
      const imports = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const chemin of imports) expect(chemin, `${fichier} importe ${chemin}`).toMatch(/^\.\/|^\.\.\/noyau\/(contrat|session)$/);
    }
  });
});

describe('hôte et invités', () => {
  it('accueille les invités et tient chacun au courant des participants (D-A3-03)', async () => {
    const hote = nouvelHote();
    const a = await inviter(hote, 'Ana');
    const b = await inviter(hote, 'Bob');
    expect(a.invite.id).toBe(1);
    expect(b.invite.id).toBe(2);
    expect(a.invite.jeu).toEqual({ id: 'faux-jeu', version: 1 });
    await attendre(() => a.invite.participants.length === 3);
    expect(a.invite.participants.map((p) => p.joueur.pseudo)).toEqual(['Hôte', 'Ana', 'Bob']);
    expect(hote.participants.map((p) => p.id)).toEqual([0, 1, 2]);
  });

  it('refuse une autre version du protocole ou du jeu (D-A1-08)', async () => {
    const hote = nouvelHote();
    await expect(inviter(hote, 'Vieux', { 'faux-jeu': 0 })).rejects.toMatchObject({ code: 'version-differente' });
    await expect(inviter(hote, 'Sans', { autre: 1 })).rejects.toMatchObject({ code: 'version-differente' });

    const [cote, chezInvite] = paireDeCanaux();
    hote.accueillir(cote);
    const recus: string[] = [];
    chezInvite.surMessage((t) => recus.push(t));
    chezInvite.envoyer(JSON.stringify({ type: 'bonjour', protocole: PROTOCOLE + 1, jeux: MES_JEUX, joueur: joueur('Futur') }));
    await attendre(() => recus.length > 0);
    expect(JSON.parse(recus[0]!)).toEqual({ type: 'refus', raison: 'protocole-different' });
    expect(hote.participants).toHaveLength(1);
  });

  it('accepte 7 invités, pas un de plus (D-A3-11)', async () => {
    const hote = nouvelHote();
    for (let i = 1; i <= 7; i++) await inviter(hote, `J${i}`);
    await expect(inviter(hote, 'J8')).rejects.toMatchObject({ code: 'salon-plein' });
    expect(hote.participants).toHaveLength(8);
  });

  it('ferme un canal qui ne se présente pas', async () => {
    const hote = new HoteReseau({ jeu: { id: 'faux-jeu', version: 1 }, joueur: joueur('H'), delaiBonjourMs: 20 });
    const [cote, chezInvite] = paireDeCanaux();
    hote.accueillir(cote);
    await attendre(() => !chezInvite.ouvert);
    expect(hote.participants).toHaveLength(1);
  });

  it('suit les départs et prévient tout le monde quand l’hôte ferme', async () => {
    const hote = nouvelHote();
    const a = await inviter(hote, 'Ana');
    const b = await inviter(hote, 'Bob');
    const departs: string[] = [];
    hote.surDepart((p) => departs.push(p.joueur.pseudo));
    a.invite.quitter();
    await attendre(() => departs.length === 1);
    expect(departs).toEqual(['Ana']);
    await attendre(() => b.invite.participants.length === 2);

    let ferme = false;
    b.invite.surFermeture(() => (ferme = true));
    hote.fermer();
    await attendre(() => ferme);
    expect(b.invite.connecte).toBe(false);
  });

  it('mesure le délai aller-retour jusqu’à l’hôte (D-A3-14)', async () => {
    const hote = nouvelHote();
    const { invite } = await inviter(hote, 'Ana');
    const ms = await invite.mesurerDelai();
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThan(200);
  });
});

describe('partie en réseau avec le faux jeu', () => {
  const place = (pseudo: string, ordinateur = false): Place => ({
    joueur: joueur(pseudo),
    controle: ordinateur ? { type: 'ordinateur', niveau: 1 } : { type: 'humain' },
  });

  it("se joue jusqu'au bout : l'hôte arbitre, 3 invités et 2 robots jouent (D-A2-02, D-A3-11)", async () => {
    const hote = nouvelHote();
    const invites = await Promise.all(['Ana', 'Bob', 'Cyd'].map((p) => inviter(hote, p)));
    const session = SessionDePartie.creer(
      fauxJeu,
      [place('Hôte'), place('Ana'), place('Bob'), place('Cyd'), place('R1', true), place('R2', true)],
      { graine: 42, options: { cible: 30 } },
    );
    // Les invités jouent dès que c'est leur tour ; l'hôte joue sur son propre téléphone.
    for (const { invite } of invites) {
      invite.surVue(({ vue, tour, fin }) => {
        if (!fin && tour === invite.place) invite.proposerCoup({ avancer: (vue as Vue).compteur % 2 ? 1 : 2 });
      });
    }
    session.ecouter(() => {
      if (!session.fin && session.joueurCourant === 0) setTimeout(() => session.proposerCoup(0, { avancer: 1 }));
    });
    brancherPartie(hote, session, {
      places: new Map(invites.map(({ invite }, i) => [invite.id, i + 1])),
      donnees: { jeu: 'faux-jeu' },
      delaiOrdinateurMs: 0,
    });
    if (session.joueurCourant === 0) session.proposerCoup(0, { avancer: 1 });

    await attendre(() => session.fin !== null && invites.every(({ invite }) => invite.vue?.fin));
    const auteurs = new Set(session.coups.map((c) => c.joueur));
    expect([...auteurs].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    for (const { invite } of invites) {
      expect(invite.donneesLancement).toEqual({ jeu: 'faux-jeu' });
      expect(invite.vue?.fin).toEqual(session.fin);
      expect((invite.vue?.vue as Vue).compteur).toBe(session.etat.compteur);
    }
  });

  it('chaque invité ne reçoit que sa vue : jamais le secret d’un autre (D-A2-03)', async () => {
    const hote = nouvelHote();
    const invites = await Promise.all(['Ana', 'Bob'].map((p) => inviter(hote, p)));
    const session = SessionDePartie.creer(fauxJeu, [place('Hôte'), place('Ana'), place('Bob')], { graine: 7 });
    brancherPartie(hote, session, { places: new Map([[1, 1], [2, 2]]) });
    session.proposerCoup(0, { avancer: 1 });
    await attendre(() => invites.every(({ invite }) => (invite.vue?.vue as Vue | undefined)?.compteur === 1));

    const secrets = session.etat.secrets;
    invites.forEach(({ invite, recus }, i) => {
      const moi = i + 1;
      expect((invite.vue?.vue as Vue).monSecret).toBe(secrets[moi]);
      const tout = recus.join('\n');
      secrets.forEach((s, j) => {
        if (j !== moi) expect(tout).not.toContain(String(s));
      });
    });
  });

  it("refuse le coup d'un invité hors de son tour (D-A2-02)", async () => {
    const hote = nouvelHote();
    const { invite } = await inviter(hote, 'Ana');
    const session = SessionDePartie.creer(fauxJeu, [place('Hôte'), place('Ana')], { graine: 1 });
    brancherPartie(hote, session, { places: new Map([[invite.id, 1]]) });
    const refus: string[] = [];
    invite.surCoupRefuse((r) => refus.push(r));
    invite.proposerCoup({ avancer: 1 }); // c'est à l'hôte (place 0)
    invite.proposerCoup({ tricher: true });
    await attendre(() => refus.length === 2);
    expect(refus).toEqual(['pas-ton-tour', 'pas-ton-tour']);
    session.proposerCoup(0, { avancer: 1 });
    invite.proposerCoup({ avancer: 3 });
    await attendre(() => refus.length === 3);
    expect(refus[2]).toBe('coup-interdit');
    expect(session.coups).toHaveLength(1);
  });

  it('ferme l’entrée du salon une fois la partie lancée', async () => {
    const hote = nouvelHote();
    await inviter(hote, 'Ana');
    const session = SessionDePartie.creer(fauxJeu, [place('Hôte'), place('Ana')]);
    brancherPartie(hote, session, { places: new Map([[1, 1]]) });
    await expect(inviter(hote, 'Tard')).rejects.toMatchObject({ code: 'partie-lancee' });
  });
});

describe('fichier de configuration distant (D-A3-08)', () => {
  const repondre =
    (corps: unknown, statut = 200): typeof fetch =>
    async (_url, init) => {
      expect(init?.cache).toBe('no-store');
      return new Response(JSON.stringify(corps), { status: statut });
    };

  it("lit l'adresse du serveur et les serveurs STUN", async () => {
    const config = await lireConfigReseau('https://x/config-reseau.json', repondre({ signalisation: 'wss://serveur.exemple/', stun: ['stun:stun.exemple:3478', 'http://non'] }));
    expect(config).toEqual({ signalisation: 'wss://serveur.exemple', stun: ['stun:stun.exemple:3478'] });
  });

  it('refuse un fichier absent, vide ou une adresse non chiffrée (D-T-01)', async () => {
    for (const chercher of [repondre({}, 404), repondre({ signalisation: '' }), repondre({ signalisation: 'ws://serveur.exemple' })]) {
      const erreur = await lireConfigReseau('https://x/c.json', chercher).catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(ErreurReseau);
      expect((erreur as ErreurReseau).code).toBe('config-introuvable');
    }
    await expect(lireConfigReseau('https://x/c.json', repondre({ signalisation: 'ws://127.0.0.1:8787' }))).resolves.toBeTruthy();
  });

  it('le fichier publié avec l’appli est valide et n’est pas gardé hors ligne', async () => {
    const brut = readFileSync(join(process.cwd(), 'public/config-reseau.json'), 'utf8');
    const config = JSON.parse(brut) as { signalisation: string; stun: string[] };
    expect(typeof config.signalisation).toBe('string');
    expect(config.stun.every((s) => s.startsWith('stun:'))).toBe(true);
    const vite = readFileSync(join(process.cwd(), 'vite.config.ts'), 'utf8');
    expect(vite).not.toMatch(/globPatterns:[^\n]*json/);
  });
});
