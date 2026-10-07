import { createServer, type Server } from 'node:http';
import { build, type Plugin } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EssaiAppli } from './navigateur/appli';
import { demarrerServeur } from './serveur-local';

/**
 * Salons de bout en bout : la vraie appli dans des onglets d'un Chromium
 * invisible (un onglet = un téléphone), le serveur de mise en relation en
 * local (workerd) et du vrai WebRTC entre les onglets. On clique dans les
 * vrais écrans de salon ; seul l'écran Phaser du jeu est remplacé par un
 * joueur automatique.
 */

declare global {
  interface Window {
    essaiAppli: EssaiAppli;
  }
}

/** Phaser n'est jamais chargé ici (l'écran est remplacé) : un module vide le remplace dans le paquet. */
const sansPhaser: Plugin = {
  name: 'sans-phaser',
  setup(b) {
    b.onResolve({ filter: /^phaser$/ }, () => ({ path: 'phaser', namespace: 'vide' }));
    b.onLoad({ filter: /.*/, namespace: 'vide' }, () => ({ contents: 'export default {};' }));
  },
};

let serveur: Awaited<ReturnType<typeof demarrerServeur>>;
let site: Server;
let adresse: string;
let navigateur: Browser;

beforeAll(async () => {
  serveur = await demarrerServeur();
  const paquet = await build({
    entryPoints: [new URL('./navigateur/appli.ts', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    write: false,
    target: 'es2022',
    plugins: [sansPhaser],
  });
  const js = paquet.outputFiles[0]!.text;
  const config = JSON.stringify({ signalisation: serveur.url, stun: [] });
  site = createServer((req, res) => {
    const chemin = new URL(req.url ?? '/', 'http://x').pathname;
    if (chemin === '/appli.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(js);
    else if (chemin === '/config-reseau.json') res.writeHead(200, { 'content-type': 'application/json' }).end(config);
    else res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><meta charset="utf-8"><script type="module" src="/appli.js"></script>');
  });
  await new Promise<void>((ok) => site.listen(0, '127.0.0.1', ok));
  adresse = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  navigateur = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? undefined,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
});

afterAll(async () => {
  await navigateur?.close();
  site?.close();
  await serveur?.arreter();
});

/** Un téléphone neuf, avec son pseudo enregistré dans les paramètres. */
async function telephone(pseudo: string, chemin = '#/jeux'): Promise<Page> {
  const page = await navigateur.newPage();
  page.on('pageerror', (e) => console.error(`${pseudo} :`, e.message));
  await page.addInitScript((p) => {
    localStorage.setItem('defyme.reglages.v1', JSON.stringify({ pseudo: p, couleur: '#e53935', son: false, langue: 'fr' }));
  }, pseudo);
  await page.goto(adresse + chemin);
  return page;
}

/** L'hôte crée le salon en un geste depuis la page du jeu, et lit le code et le lien du QR code. */
async function creerSalon(hote: Page): Promise<{ code: string; lien: string }> {
  await hote.click('[data-action="creer-salon"]');
  const code = (await hote.textContent('.code-salon', { timeout: 10_000 }))!;
  await hote.waitForSelector('.qr-salon svg');
  const lien = (await hote.getAttribute('.lien-salon', 'href'))!;
  return { code, lien };
}

/** Un invité tape le code depuis le menu Jeux. */
async function rejoindreParCode(invite: Page, code: string): Promise<void> {
  await invite.click('[data-action="rejoindre-salon"]');
  await invite.fill('#code-salon', code.toLowerCase());
  await invite.click('[data-action="entrer"]');
}

const places = (p: Page) => p.textContent('[data-places]');

async function finDePartie(p: Page) {
  await p.waitForSelector('.fin-partie:not([hidden])', { timeout: 120_000 });
  return p.evaluate(() => window.essaiAppli.ecran());
}

describe('salons de bout en bout, en vrai WebRTC', () => {
  it('4 téléphones : 2 entrent par le code, 1 par le lien du QR code, et tous finissent la même partie de Petits chevaux', async () => {
    const hote = await telephone('Hôte', '#/jeu/petits-chevaux');
    const { code, lien } = await creerSalon(hote);
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    expect(lien).toBe(`${adresse}?salon=${code}`);
    expect(await places(hote)).toBe('1 sur 4');
    expect(await hote.isDisabled('[data-action="lancer"]')).toBe(true);

    const ana = await telephone('Ana');
    const bob = await telephone('Bob');
    await Promise.all([rejoindreParCode(ana, code), rejoindreParCode(bob, code)]);
    // Le 3e invité ouvre le lien du QR code, comme l'appareil photo l'aurait fait.
    const cyd = await telephone('Cyd', `?salon=${code}`);
    const invites = [ana, bob, cyd];

    await hote.waitForFunction(() => document.querySelector('[data-places]')?.textContent === '4 sur 4', null, { timeout: 20_000 });
    for (const p of invites) await p.waitForFunction(() => document.querySelector('[data-places]')?.textContent === '4 sur 4');
    const noms = await hote.$$eval('.joueur-salon__nom', (els) => els.map((e) => e.textContent));
    expect(noms[0]).toBe('Hôte (hôte, toi)');
    expect(noms.slice(1).sort()).toEqual(['Ana', 'Bob', 'Cyd']);
    expect(await cyd.textContent('[role="status"]')).toContain(`Tu es dans le salon ${code}`);
    expect(await hote.isDisabled('[data-action="ajouter-robot"]')).toBe(true);

    await hote.click('[data-action="lancer"]');
    const finHote = await finDePartie(hote);
    expect(finHote?.joueur).toBe(0);
    expect(finHote?.vue.gagnant).not.toBeNull();
    const placesVues = new Set<number>([0]);
    for (const p of invites) {
      const fin = await finDePartie(p);
      placesVues.add(fin!.joueur);
      // Tous voient le même état final, sans la suite du hasard (D-A2-03).
      expect(fin?.vue).toEqual(finHote?.vue);
      expect(fin?.vue).not.toHaveProperty('hasard');
      expect(await p.evaluate(() => window.essaiAppli.coupsProposes())).toBeGreaterThan(0);
    }
    expect([...placesVues].sort()).toEqual([0, 1, 2, 3]);
    // Chacun voit le même gagnant annoncé.
    const gagnant = finHote!.vue.joueurs[finHote!.vue.gagnant!]!.pseudo;
    for (const p of [hote, ...invites]) {
      const message = await p.textContent('.fin-partie');
      const moi = (await p.evaluate(() => window.essaiAppli.ecran()))!.joueur;
      expect(message).toContain(moi === finHote!.vue.gagnant ? 'Bravo' : `${gagnant} a gagné`);
    }
    await Promise.all([hote, ...invites].map((p) => p.close()));
  });

  it("l'hôte, un invité et deux robots du salon vont au bout d'une partie", async () => {
    const hote = await telephone('Hôte', '#/jeu/petits-chevaux');
    const { code } = await creerSalon(hote);
    const ana = await telephone('Ana');
    await rejoindreParCode(ana, code);
    await hote.waitForFunction(() => document.querySelector('[data-places]')?.textContent === '2 sur 4', null, { timeout: 20_000 });
    await hote.selectOption('#niveau-robot', '1');
    await hote.click('[data-action="ajouter-robot"]');
    await hote.selectOption('#niveau-robot', '3');
    await hote.click('[data-action="ajouter-robot"]');
    expect(await places(hote)).toBe('4 sur 4');
    await hote.click('[data-action="lancer"]');
    const finHote = await finDePartie(hote);
    const finAna = await finDePartie(ana);
    expect(finAna?.joueur).toBe(1);
    expect(finAna?.vue).toEqual(finHote?.vue);
    expect(finHote?.vue.joueurs.map((j) => j.pseudo)).toEqual(['Hôte', 'Ana', 'Ordi 1', 'Ordi 2']);
    expect(new Set(finHote?.vue.joueurs.map((j) => j.couleur)).size).toBe(4);
    await Promise.all([hote.close(), ana.close()]);
  });

  it('messages clairs : version incompatible (D-A1-08), code inconnu, adresse du serveur vide', async () => {
    const hote = await telephone('Hôte', '#/jeu/petits-chevaux');
    const { code } = await creerSalon(hote);

    const vieux = await telephone('Vieux', '?version=99#/jeux');
    await rejoindreParCode(vieux, code);
    await vieux.waitForSelector('[data-erreur="version-differente"]', { timeout: 20_000 });
    expect(await vieux.textContent('[role="alert"]')).toContain('même version');
    await vieux.fill('#code-salon', 'QQQQ');
    await vieux.click('[data-action="entrer"]');
    await vieux.waitForSelector('[data-erreur="salon-introuvable"]');

    const sansServeur = await navigateur.newPage();
    await sansServeur.route('**/config-reseau.json', (r) => r.fulfill({ json: { signalisation: '', stun: [] } }));
    await sansServeur.goto(`${adresse}#/jeu/petits-chevaux`);
    await sansServeur.click('[data-action="creer-salon"]');
    await sansServeur.waitForSelector('[data-erreur="config-introuvable"]');
    expect(await sansServeur.textContent('[role="alert"]')).toContain('config-reseau.json');
    await Promise.all([hote.close(), vieux.close(), sansServeur.close()]);
  });
});
