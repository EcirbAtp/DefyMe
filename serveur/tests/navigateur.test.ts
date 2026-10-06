import { createServer, type Server } from 'node:http';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Essai } from './navigateur/page';
import { demarrerServeur } from './serveur-local';

/**
 * Vrai WebRTC entre onglets d'un Chromium invisible, mis en relation par le
 * serveur lancé en local (workerd). C'est l'« agent de test automatique » du
 * plan : jusqu'à 8 téléphones simulés sur un seul ordinateur.
 */

declare global {
  interface Window {
    essai: Essai;
  }
}

let serveur: Awaited<ReturnType<typeof demarrerServeur>>;
let site: Server;
let adressePage: string;
let navigateur: Browser;

beforeAll(async () => {
  serveur = await demarrerServeur();
  const script = await build({
    entryPoints: [new URL('./navigateur/page.ts', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    write: false,
    target: 'es2022',
  });
  const js = script.outputFiles[0]!.text;
  site = createServer((req, res) => {
    if (req.url === '/page.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' }).end(js);
    } else {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><script type="module" src="/page.js"></script>');
    }
  });
  await new Promise<void>((ok) => site.listen(0, '127.0.0.1', ok));
  const port = (site.address() as { port: number }).port;
  adressePage = `http://127.0.0.1:${port}/`;
  navigateur = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? undefined,
    // Sans cette option, Chromium masque les adresses locales derrière des noms mDNS, que le conteneur ne résout pas.
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
});

afterAll(async () => {
  await navigateur?.close();
  site?.close();
  await serveur?.arreter();
});

async function telephone(): Promise<Page> {
  const page = await navigateur.newPage();
  page.on('pageerror', (e) => console.error('page :', e.message));
  await page.goto(adressePage);
  await page.waitForFunction(() => 'essai' in window);
  return page;
}

describe('salon en vrai WebRTC', () => {
  it('un hôte et 7 invités jouent une partie complète, tous voient la même fin (D-A3-11)', async () => {
    const hote = await telephone();
    const code = await hote.evaluate((a) => window.essai.ouvrir(a), serveur.url);
    const invites = await Promise.all(Array.from({ length: 7 }, () => telephone()));
    const ids = await Promise.all(
      invites.map((p, i) => p.evaluate(([a, c, n]) => window.essai.rejoindre(a!, c!, n!), [serveur.url, code, `Invité ${i + 1}`])),
    );
    expect(ids.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    await hote.waitForFunction(() => window.essai.participants().length === 8);

    // Le salon est plein : un 9e téléphone est refusé.
    const neuvieme = await telephone();
    expect(await neuvieme.evaluate(([a, c]) => window.essai.echecRejoindre(a!, c!), [serveur.url, code])).toBe('salon-plein');

    const delai = await invites[0]!.evaluate(() => window.essai.delai());
    expect(delai).toBeLessThan(200); // D-A3-14, sur une même machine

    await hote.evaluate(() => window.essai.lancer(0));
    await hote.waitForFunction(() => window.essai.etatHote()?.fin != null, null, { timeout: 20_000 });
    const final = await hote.evaluate(() => window.essai.etatHote());
    expect(final?.auteurs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const p of invites) {
      await p.waitForFunction(() => window.essai.etatInvite()?.vue?.fin != null);
      const vu = await p.evaluate(() => window.essai.etatInvite());
      expect(vu?.vue?.fin).toEqual(final?.fin);
      expect(vu?.vue?.vue.compteur).toBe(final?.compteur);
    }
    await Promise.all([hote, neuvieme, ...invites].map((p) => p.close()));
  });

  it("l'hôte, un invité et des robots : la partie va au bout", async () => {
    const hote = await telephone();
    const code = await hote.evaluate((a) => window.essai.ouvrir(a), serveur.url);
    const invite = await telephone();
    await invite.evaluate(([a, c]) => window.essai.rejoindre(a!, c!, 'Fab'), [serveur.url, code]);
    await hote.waitForFunction(() => window.essai.participants().length === 2);
    await hote.evaluate(() => window.essai.lancer(6));
    await hote.waitForFunction(() => window.essai.etatHote()?.fin != null, null, { timeout: 20_000 });
    expect((await hote.evaluate(() => window.essai.etatHote()))?.auteurs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    await Promise.all([hote.close(), invite.close()]);
  });

  it('un code inconnu donne un message clair', async () => {
    const p = await telephone();
    expect(await p.evaluate((a) => window.essai.echecRejoindre(a, 'QQQQ'), serveur.url)).toBe('salon-introuvable');
    await p.close();
  });

  it('un serveur éteint donne « serveur injoignable » (D-A3-09)', async () => {
    const p = await telephone();
    expect(await p.evaluate(() => window.essai.echecRejoindre('ws://127.0.0.1:9', 'ABCD'))).toBe('serveur-injoignable');
    await p.close();
  });
});
