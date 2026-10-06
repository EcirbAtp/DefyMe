import { LANGUES, type Langue } from '../noyau/contrat';
import { en } from './en';
import { fr, type CleTexte } from './fr';

/** Traductions (DC-7). Les textes de l'interface ne sont jamais écrits en dur (D-D-05). */
export const TRADUCTIONS: Record<Langue, Record<CleTexte, string>> = { fr, en };

export type { CleTexte };

/** Nom de chaque langue, écrit dans cette langue. */
export const NOMS_LANGUES: Record<Langue, string> = { fr: 'Français', en: 'English' };

let langueCourante: Langue = 'fr';

export function langue(): Langue {
  return langueCourante;
}

export function changerLangue(nouvelle: Langue): void {
  langueCourante = nouvelle;
  if (typeof document !== 'undefined') document.documentElement.lang = nouvelle;
}

/** Texte traduit, avec remplacement des {variables}. */
export function t(cle: CleTexte, variables: Record<string, string | number> = {}, dans: Langue = langueCourante): string {
  const modele = TRADUCTIONS[dans][cle] ?? TRADUCTIONS.fr[cle] ?? cle;
  return modele.replace(/\{(\w+)\}/g, (tout, nom: string) => (nom in variables ? String(variables[nom]) : tout));
}

/**
 * Langue du téléphone, pour le premier lancement (D-D-04) : la première
 * langue préférée que l'appli connaît, sinon l'anglais.
 */
export function langueDuTelephone(preferees: readonly string[] = navigateurLangues()): Langue {
  for (const code of preferees) {
    const base = code.toLowerCase().split('-')[0];
    const trouvee = LANGUES.find((l) => l === base);
    if (trouvee) return trouvee;
  }
  return 'en';
}

function navigateurLangues(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}
