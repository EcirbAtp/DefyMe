/**
 * Un canal relie l'hôte à un invité. En vrai, c'est un canal de données
 * WebRTC (webrtc.ts) ; dans les tests, une paire en mémoire. L'hôte et les
 * invités ne voient que cette interface, ce qui permet de tester toute la
 * logique réseau sans navigateur.
 */
export interface Canal {
  envoyer(texte: string): void;
  /** Appelé à chaque message reçu. Renvoie une fonction pour se désabonner. */
  surMessage(rappel: (texte: string) => void): () => void;
  /** Appelé une fois, quand le canal se ferme d'un côté ou de l'autre. */
  surFermeture(rappel: () => void): () => void;
  fermer(): void;
  readonly ouvert: boolean;
}

/** Liste d'écouteurs, désabonnables un par un. */
export class Ecouteurs<T> {
  #rappels = new Set<(valeur: T) => void>();

  ajouter(rappel: (valeur: T) => void): () => void {
    this.#rappels.add(rappel);
    return () => this.#rappels.delete(rappel);
  }

  prevenir(valeur: T): void {
    for (const rappel of [...this.#rappels]) rappel(valeur);
  }

  vider(): void {
    this.#rappels.clear();
  }
}

/**
 * Deux canaux reliés l'un à l'autre, en mémoire. Les messages arrivent de
 * façon asynchrone, comme sur un vrai réseau.
 */
export function paireDeCanaux(): [Canal, Canal] {
  const a = new CanalMemoire();
  const b = new CanalMemoire();
  a.autre = b;
  b.autre = a;
  return [a, b];
}

class CanalMemoire implements Canal {
  autre!: CanalMemoire;
  ouvert = true;
  #messages = new Ecouteurs<string>();
  #fermeture = new Ecouteurs<void>();

  envoyer(texte: string): void {
    if (!this.ouvert) throw new Error('Canal fermé');
    const autre = this.autre;
    queueMicrotask(() => autre.ouvert && autre.#messages.prevenir(texte));
  }

  surMessage(rappel: (texte: string) => void): () => void {
    return this.#messages.ajouter(rappel);
  }

  surFermeture(rappel: () => void): () => void {
    return this.#fermeture.ajouter(rappel);
  }

  fermer(): void {
    if (!this.ouvert) return;
    this.ouvert = false;
    this.#fermeture.prevenir();
    queueMicrotask(() => this.autre.fermer());
  }
}
