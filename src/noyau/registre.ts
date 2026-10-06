import { LANGUES, MAX_JOUEURS, type JeuQuelconque } from './contrat';

/**
 * Registre des jeux (D-A1-04, D-A1-05).
 *
 * Le menu Jeux se construit à partir du registre. Les jeux sont découverts
 * automatiquement : tout dossier `src/jeux/<id>/` dont le fichier `index.ts`
 * exporte par défaut un `Jeu` y apparaît, sans toucher au noyau.
 */
export interface Registre {
  /** Jeux triés par nom dans la langue demandée. */
  lister(langue?: (typeof LANGUES)[number]): JeuQuelconque[];
  trouver(id: string): JeuQuelconque | undefined;
}

const FORMAT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Problèmes de la fiche d'un jeu ; liste vide si elle est valide. */
export function problemesFiche(jeu: JeuQuelconque): string[] {
  const p: string[] = [];
  const f = jeu?.fiche;
  if (!f) return ['fiche absente'];
  if (!FORMAT_ID.test(f.id ?? '')) p.push(`identifiant invalide : « ${f.id} »`);
  if (!Number.isInteger(f.version) || f.version < 1) p.push('version : entier ≥ 1 attendu');
  for (const langue of LANGUES) {
    if (!f.nom?.[langue]?.trim()) p.push(`nom manquant en « ${langue} »`);
    if (!f.description?.[langue]?.trim()) p.push(`description manquante en « ${langue} »`);
  }
  if (!f.icone?.trim()) p.push('icône manquante');
  if (!Number.isInteger(f.joueursMin) || f.joueursMin < 1) p.push('joueursMin : entier ≥ 1 attendu');
  if (!Number.isInteger(f.joueursMax) || f.joueursMax > MAX_JOUEURS) {
    p.push(`joueursMax : entier ≤ ${MAX_JOUEURS} attendu`);
  }
  if (f.joueursMin > f.joueursMax) p.push('joueursMin dépasse joueursMax');
  if (f.tempsReflexionMaxMs !== undefined && !(f.tempsReflexionMaxMs > 0)) {
    p.push('tempsReflexionMaxMs : nombre > 0 attendu');
  }
  for (const nom of ['etatInitial', 'joueurCourant', 'coupsPermis', 'jouer', 'estFini', 'vuePour', 'ordinateur', 'ecran'] as const) {
    if (typeof jeu[nom] !== 'function') p.push(`fonction « ${nom} » manquante`);
  }
  return p;
}

/** Crée un registre à partir d'une liste de jeux. Refuse un jeu invalide ou un doublon. */
export function creerRegistre(jeux: readonly JeuQuelconque[]): Registre {
  const parId = new Map<string, JeuQuelconque>();
  for (const jeu of jeux) {
    const problemes = problemesFiche(jeu);
    if (problemes.length > 0) {
      throw new Error(`Jeu « ${jeu?.fiche?.id ?? '?'} » invalide : ${problemes.join(' ; ')}`);
    }
    if (parId.has(jeu.fiche.id)) throw new Error(`Jeu « ${jeu.fiche.id} » enregistré deux fois`);
    parId.set(jeu.fiche.id, jeu);
  }
  return {
    lister(langue = 'fr') {
      return [...parId.values()].sort((a, b) => a.fiche.nom[langue].localeCompare(b.fiche.nom[langue], langue));
    },
    trouver(id) {
      return parId.get(id);
    },
  };
}

/** Jeux trouvés dans `src/jeux/<id>/index.ts`. */
const modules = import.meta.glob<JeuQuelconque>('../jeux/*/index.ts', { eager: true, import: 'default' });

/** Registre de l'appli. */
export const registre: Registre = creerRegistre(Object.values(modules));
