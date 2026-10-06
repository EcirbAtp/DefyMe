/**
 * Serveur de mise en relation de DefyMe (D-A3-06 à D-A3-09).
 *
 * Il présente les téléphones entre eux, rien de plus : l'hôte ouvre un salon
 * et reçoit un code de 4 caractères, chaque invité s'y connecte avec ce code,
 * et le serveur fait passer leurs messages de connexion WebRTC (offre,
 * réponse, candidats). La partie ne passe jamais par ici.
 *
 * Un salon = un Durable Object nommé par son code, qui tient les WebSockets
 * de l'hôte et des invités. Le code meurt quand l'hôte se déconnecte (D-A3-05).
 * WebSockets en hibernation : rien n'est facturé pendant les silences (D-A3-09).
 */

import { DurableObject } from 'cloudflare:workers';

export interface Env {
  SALONS: DurableObjectNamespace<Salon>;
}

/** Pas de 0/O ni de 1/I/L : le code se dicte et se tape sans erreur. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE = /^[A-Z2-9]{4}$/;
const TYPES_PERMIS = new Set(['offre', 'reponse', 'candidat']);
const TAILLE_MAX = 8192;
const MAX_INVITES = 7;

type Attache = { role: 'hote' } | { role: 'invite'; id: string };

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const url = new URL(requete.url);
    if (requete.headers.get('Upgrade') !== 'websocket') return new Response('DefyMe', { status: 426 });
    if (url.pathname === '/salon') {
      // Ouvrir un salon : on tire des codes jusqu'à en trouver un libre.
      for (let essai = 0; essai < 5; essai++) {
        const code = tirerCode();
        const reponse = await env.SALONS.get(env.SALONS.idFromName(code)).fetch(requete.url + '/' + code + '?hote', requete);
        if (reponse.status !== 409) return reponse;
      }
      return new Response('Aucun code libre', { status: 503 });
    }
    const code = /^\/salon\/([A-Za-z0-9]{4})$/.exec(url.pathname)?.[1]?.toUpperCase();
    if (!code || !CODE.test(code)) return refuser(4004, 'Salon introuvable');
    return env.SALONS.get(env.SALONS.idFromName(code)).fetch(requete);
  },
};

function envoyer(ws: WebSocket | undefined, message: object): void {
  try {
    ws?.send(JSON.stringify(message));
  } catch {
    // socket en train de fermer : le message n'a plus de destinataire
  }
}

/** Refus lisible par le navigateur : la WebSocket s'ouvre puis se ferme avec un code (D-A3-12). */
function refuser(code: number, raison: string): Response {
  const { 0: client, 1: serveur } = new WebSocketPair();
  serveur.accept();
  serveur.close(code, raison);
  return new Response(null, { status: 101, webSocket: client });
}

function tirerCode(): string {
  const octets = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join('');
}

export class Salon extends DurableObject<Env> {
  async fetch(requete: Request): Promise<Response> {
    const url = new URL(requete.url);
    const sockets = this.ctx.getWebSockets();
    const hote = this.ctx.getWebSockets('hote')[0];
    const { 0: client, 1: serveur } = new WebSocketPair();
    let attache: Attache;
    if (url.searchParams.has('hote')) {
      if (sockets.length > 0) return new Response('Code déjà pris', { status: 409 });
      attache = { role: 'hote' };
      this.ctx.acceptWebSocket(serveur, ['hote']);
      serveur.serializeAttachment(attache);
      envoyer(serveur, { type: 'salon', code: url.pathname.slice(-4) });
    } else {
      if (!hote) return refuser(4004, 'Salon introuvable');
      if (sockets.length - 1 >= MAX_INVITES) return refuser(4003, 'Salon plein');
      attache = { role: 'invite', id: crypto.randomUUID().slice(0, 8) };
      this.ctx.acceptWebSocket(serveur, [attache.id]);
      serveur.serializeAttachment(attache);
      envoyer(hote, { type: 'arrivee', de: attache.id });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, brut: string | ArrayBuffer): void {
    // Seuls les messages de connexion WebRTC passent (D-A3-06).
    if (typeof brut !== 'string' || brut.length > TAILLE_MAX) return ws.close(1009, 'Message refusé');
    let msg: { type?: unknown; vers?: unknown; donnees?: unknown };
    try {
      msg = JSON.parse(brut);
    } catch {
      return ws.close(1003, 'Message refusé');
    }
    if (typeof msg.type !== 'string' || !TYPES_PERMIS.has(msg.type)) return ws.close(1003, 'Message refusé');
    const de = ws.deserializeAttachment() as Attache;
    const sortant = { type: msg.type, donnees: msg.donnees } as Record<string, unknown>;
    let cible: WebSocket | undefined;
    if (de.role === 'hote') {
      if (typeof msg.vers !== 'string') return;
      cible = this.ctx.getWebSockets(msg.vers)[0];
    } else {
      cible = this.ctx.getWebSockets('hote')[0];
      sortant.de = de.id;
    }
    envoyer(cible, sortant);
  }

  webSocketClose(ws: WebSocket): void {
    this.depart(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.depart(ws);
  }

  /** L'hôte parti, le salon ferme et son code ne mène plus nulle part (D-A3-05). */
  private depart(ws: WebSocket): void {
    const de = ws.deserializeAttachment() as Attache;
    if (de.role === 'hote') {
      for (const autre of this.ctx.getWebSockets()) if (autre !== ws) autre.close(4000, 'Salon fermé');
    } else {
      envoyer(this.ctx.getWebSockets('hote')[0], { type: 'depart', de: de.id });
    }
    try {
      ws.close(1000, 'Au revoir');
    } catch {
      // déjà fermé
    }
  }
}
