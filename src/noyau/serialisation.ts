/**
 * Outils de sérialisation partagés par la session et la vérification des jeux.
 */

/** Texte JSON canonique : clés triées, pour comparer deux valeurs. */
export function jsonCanonique(valeur: unknown): string {
  return JSON.stringify(valeur, (_cle, v: unknown) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}

/** Vrai si deux valeurs ont la même forme JSON. */
export function memeValeur(a: unknown, b: unknown): boolean {
  return jsonCanonique(a) === jsonCanonique(b);
}

/** Copie profonde via JSON, comme après un passage par le réseau ou la sauvegarde. */
export function copieJson<T>(valeur: T): T {
  return JSON.parse(JSON.stringify(valeur)) as T;
}

/**
 * Raison pour laquelle une valeur ne survit pas à JSON, ou `null` si elle
 * survit : fonctions, `undefined`, NaN, Infinity, Map, Set, Date, classes...
 */
export function problemeSerialisation(valeur: unknown, chemin = '$'): string | null {
  if (valeur === null) return null;
  switch (typeof valeur) {
    case 'string':
    case 'boolean':
      return null;
    case 'number':
      return Number.isFinite(valeur) ? null : `${chemin} : nombre non fini (${valeur})`;
    case 'object': {
      if (Array.isArray(valeur)) {
        for (let i = 0; i < valeur.length; i++) {
          const p = problemeSerialisation(valeur[i], `${chemin}[${i}]`);
          if (p) return p;
        }
        return null;
      }
      const proto = Object.getPrototypeOf(valeur);
      if (proto !== Object.prototype && proto !== null) {
        return `${chemin} : objet de type ${proto?.constructor?.name ?? 'inconnu'} (seuls les objets simples sont permis)`;
      }
      for (const [cle, v] of Object.entries(valeur)) {
        const p = problemeSerialisation(v, `${chemin}.${cle}`);
        if (p) return p;
      }
      return null;
    }
    default:
      return `${chemin} : valeur de type ${typeof valeur}`;
  }
}

/** Gèle récursivement une valeur, pour détecter un jeu qui modifierait son état. */
export function gelerProfond<T>(valeur: T): T {
  if (valeur && typeof valeur === 'object' && !Object.isFrozen(valeur)) {
    Object.freeze(valeur);
    for (const v of Object.values(valeur)) gelerProfond(v);
  }
  return valeur;
}
