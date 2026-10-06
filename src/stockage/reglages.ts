import { LANGUES, type Langue } from '../noyau/contrat';

/**
 * Réglages du joueur, gardés sur le téléphone uniquement (D-D-03, D-D-08) :
 * aucun compte, rien n'est envoyé.
 */
export interface Reglages {
  pseudo: string;
  couleur: string;
  son: boolean;
  langue: Langue;
}

export const PSEUDO_LONGUEUR_MAX = 16;

/** Huit couleurs bien distinctes, une par joueur possible. */
export const COULEURS = ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#fb8c00', '#00acc1', '#6d4c41'] as const;

const CLE = 'defyme.reglages.v1';

/** Stockage minimal, pour pouvoir le remplacer dans les tests. */
export interface Stockage {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

export function reglagesParDefaut(langue: Langue): Reglages {
  return { pseudo: '', couleur: COULEURS[0], son: true, langue };
}

/** Nettoie un pseudo : espaces superflus retirés, longueur limitée. */
export function nettoyerPseudo(pseudo: string): string {
  return [...pseudo.replace(/\s+/g, ' ').trim()].slice(0, PSEUDO_LONGUEUR_MAX).join('');
}

/**
 * Lit les réglages. Au premier lancement, ou si le stockage est illisible,
 * renvoie les valeurs par défaut avec la langue du téléphone (D-D-04).
 */
export function lireReglages(stockage: Stockage | undefined, langueDuTelephone: Langue): Reglages {
  const defaut = reglagesParDefaut(langueDuTelephone);
  let brut: unknown;
  try {
    const texte = stockage?.getItem(CLE);
    if (!texte) return defaut;
    brut = JSON.parse(texte);
  } catch {
    return defaut;
  }
  if (!brut || typeof brut !== 'object') return defaut;
  const r = brut as Partial<Record<keyof Reglages, unknown>>;
  return {
    pseudo: typeof r.pseudo === 'string' ? nettoyerPseudo(r.pseudo) : defaut.pseudo,
    couleur: typeof r.couleur === 'string' && (COULEURS as readonly string[]).includes(r.couleur) ? r.couleur : defaut.couleur,
    son: typeof r.son === 'boolean' ? r.son : defaut.son,
    langue: LANGUES.find((l) => l === r.langue) ?? defaut.langue,
  };
}

/** Enregistre les réglages. Renvoie faux si le téléphone refuse (navigation privée, stockage plein). */
export function ecrireReglages(stockage: Stockage | undefined, reglages: Reglages): boolean {
  try {
    if (!stockage) return false;
    stockage.setItem(CLE, JSON.stringify({ ...reglages, pseudo: nettoyerPseudo(reglages.pseudo) }));
    return true;
  } catch {
    return false;
  }
}

/** `localStorage` s'il est accessible. */
export function stockageDuNavigateur(): Stockage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}
