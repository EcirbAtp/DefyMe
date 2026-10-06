import type { Graine } from './contrat';

/**
 * Hasard reproductible issu d'une graine sur 32 bits (D-A1-07).
 *
 * Algorithme mulberry32 : rapide, sur 32 bits, et suffisant pour des dés et
 * des mélanges de cartes. Son état tient dans un seul entier, qu'un jeu range
 * dans son propre état pour continuer la même suite au coup suivant :
 *
 *   const h = new Hasard(etat.hasard);
 *   const de = h.de(6);
 *   return { ...etat, de, hasard: h.etat };
 */
export class Hasard {
  #etat: number;

  constructor(graine: Graine) {
    this.#etat = normaliserGraine(graine);
  }

  /** État courant, à ranger dans l'état du jeu (entier 32 bits non signé). */
  get etat(): Graine {
    return this.#etat;
  }

  /** Nombre réel dans [0, 1). */
  suivant(): number {
    this.#etat = (this.#etat + 0x6d2b79f5) >>> 0;
    let t = this.#etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier dans [min, max], bornes comprises. */
  entier(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Bornes invalides : [${min}, ${max}]`);
    }
    return min + Math.floor(this.suivant() * (max - min + 1));
  }

  /** Lancer de dé : entier dans [1, faces]. */
  de(faces = 6): number {
    return this.entier(1, faces);
  }

  /** Un élément au hasard. La liste ne doit pas être vide. */
  choisir<T>(liste: readonly T[]): T {
    if (liste.length === 0) throw new RangeError('Liste vide');
    return liste[this.entier(0, liste.length - 1)] as T;
  }

  /** Copie mélangée de la liste (Fisher-Yates) ; l'originale n'est pas modifiée. */
  melanger<T>(liste: readonly T[]): T[] {
    const copie = [...liste];
    for (let i = copie.length - 1; i > 0; i--) {
      const j = this.entier(0, i);
      [copie[i], copie[j]] = [copie[j] as T, copie[i] as T];
    }
    return copie;
  }

  /** Nouvelle graine tirée de cette suite, pour lancer une suite indépendante. */
  graine(): Graine {
    return Math.floor(this.suivant() * 4294967296) >>> 0;
  }
}

/** Ramène n'importe quel nombre à un entier 32 bits non signé. */
export function normaliserGraine(graine: number): Graine {
  if (!Number.isFinite(graine)) throw new RangeError(`Graine invalide : ${graine}`);
  return Math.trunc(graine) >>> 0;
}

/**
 * Tire une graine vraiment aléatoire. Réservé au téléphone hôte au lancement
 * d'une partie : les règles n'appellent jamais cette fonction.
 */
export function nouvelleGraine(): Graine {
  const tableau = new Uint32Array(1);
  globalThis.crypto.getRandomValues(tableau);
  return tableau[0] as number;
}
