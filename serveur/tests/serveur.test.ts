import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demarrerServeur } from './serveur-local';

let serveur: Awaited<ReturnType<typeof demarrerServeur>>;
beforeAll(async () => {
  serveur = await demarrerServeur();
});
afterAll(() => serveur.arreter());

type Msg = Record<string, unknown>;

/** WebSocket de test qui range les messages reçus et sait les attendre. */
class Client {
  readonly ws: WebSocket;
  readonly recus: Msg[] = [];
  ferme: { code: number } | null = null;
  /** Connexion refusée par le serveur (réponse autre que 101). */
  refuse = false;
  #attentes: (() => void)[] = [];

  constructor(chemin: string) {
    this.ws = new WebSocket(serveur.url + chemin);
    this.ws.onmessage = (e) => {
      this.recus.push(JSON.parse(String(e.data)));
      this.#reveiller();
    };
    this.ws.onclose = (e) => {
      this.ferme = { code: e.code };
      this.#reveiller();
    };
    this.ws.onerror = () => {
      if (this.ws.readyState !== WebSocket.OPEN) this.refuse = true;
      this.#reveiller();
    };
  }

  #reveiller() {
    for (const a of this.#attentes.splice(0)) a();
  }

  async attendre<T>(test: () => T | undefined | false, ms = 3000): Promise<T> {
    const fin = Date.now() + ms;
    for (;;) {
      const r = test();
      if (r) return r;
      if (Date.now() > fin) throw new Error('Délai dépassé');
      await new Promise<void>((ok) => {
        this.#attentes.push(ok);
        setTimeout(ok, 50);
      });
    }
  }

  message(type: string, n = 0): Promise<Msg> {
    return this.attendre(() => this.recus.filter((m) => m.type === type)[n]);
  }

  ouvert(): Promise<true> {
    return this.attendre(() => this.ws.readyState === WebSocket.OPEN);
  }

  fermeture(): Promise<{ code: number }> {
    return this.attendre(() => this.ferme ?? (this.refuse && { code: -1 }));
  }

  envoyer(m: Msg) {
    this.ws.send(JSON.stringify(m));
  }
}

async function ouvrirSalon(): Promise<{ hote: Client; code: string }> {
  const hote = new Client('/salon');
  const { code } = await hote.message('salon');
  return { hote, code: code as string };
}

describe('serveur de mise en relation', () => {
  it("donne à l'hôte un code de 4 caractères lisibles (D-A3-01)", async () => {
    const { hote, code } = await ouvrirSalon();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    hote.ws.close();
  });

  it("fait passer offre, réponse et candidats entre l'hôte et un invité", async () => {
    const { hote, code } = await ouvrirSalon();
    const invite = new Client('/salon/' + code.toLowerCase());
    const { de } = await hote.message('arrivee');
    expect(typeof de).toBe('string');
    await invite.ouvert();

    invite.envoyer({ type: 'offre', donnees: { sdp: 'o' } });
    expect(await hote.message('offre')).toEqual({ type: 'offre', de, donnees: { sdp: 'o' } });
    hote.envoyer({ type: 'reponse', vers: de, donnees: { sdp: 'r' } });
    expect(await invite.message('reponse')).toEqual({ type: 'reponse', donnees: { sdp: 'r' } });
    hote.envoyer({ type: 'candidat', vers: de, donnees: { c: 1 } });
    expect(await invite.message('candidat')).toEqual({ type: 'candidat', donnees: { c: 1 } });

    invite.ws.close();
    expect(await hote.message('depart')).toEqual({ type: 'depart', de });
    hote.ws.close();
  });

  it('refuse tout autre message que ceux de connexion (D-A3-06)', async () => {
    const { hote, code } = await ouvrirSalon();
    const invite = new Client('/salon/' + code);
    await invite.ouvert();
    invite.envoyer({ type: 'coup', donnees: { prendre: 1 } });
    expect((await invite.fermeture()).code).toBe(1003);
    const autre = new Client('/salon/' + code);
    await autre.ouvert();
    autre.envoyer({ type: 'offre', donnees: 'x'.repeat(10_000) });
    expect((await autre.fermeture()).code).toBe(1009);
    expect(hote.recus.some((m) => m.type === 'coup' || m.type === 'offre')).toBe(false);
    hote.ws.close();
  });

  it('refuse un code inconnu', async () => {
    const invite = new Client('/salon/ZZZZ');
    expect(await invite.fermeture()).toEqual({ code: 4004 });
    expect(await new Client('/salon/abc').fermeture()).toEqual({ code: 4004 });
  });

  it('accepte 7 invités, pas un de plus (D-A3-11)', async () => {
    const { hote, code } = await ouvrirSalon();
    const invites = Array.from({ length: 7 }, () => new Client('/salon/' + code));
    await Promise.all(invites.map((i) => i.ouvert()));
    await hote.attendre(() => hote.recus.filter((m) => m.type === 'arrivee').length === 7);
    const huitieme = new Client('/salon/' + code);
    expect(await huitieme.fermeture()).toEqual({ code: 4003 });
    expect(hote.recus.filter((m) => m.type === 'arrivee')).toHaveLength(7);
    hote.ws.close();
  });

  it("ferme le salon et invalide le code quand l'hôte part (D-A3-05)", async () => {
    const { hote, code } = await ouvrirSalon();
    const invite = new Client('/salon/' + code);
    await hote.message('arrivee');
    hote.ws.close();
    // Le serveur envoie la fermeture ; Node la signale parfois en restant à CLOSING.
    await invite.attendre(() => invite.ws.readyState >= WebSocket.CLOSING);
    const tardif = new Client('/salon/' + code);
    expect(await tardif.fermeture()).toEqual({ code: 4004 });
  });
});
