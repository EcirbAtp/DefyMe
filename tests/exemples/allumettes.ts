import type { Jeu, NiveauOrdinateur } from '../../src/noyau/contrat';
import { Hasard } from '../../src/noyau/hasard';

/**
 * Jeu d'exemple pour tester le contrat : chacun à son tour retire 1 à 3
 * allumettes ; celui qui prend la dernière a perdu. 2 à 8 joueurs.
 * Il sert aussi de modèle pour écrire un vrai jeu.
 */
export type Etat = {
  joueurs: number;
  restantes: number;
  courant: number;
  perdant: number | null;
};
export type Coup = { prendre: 1 | 2 | 3 };

/** Probabilité de jouer le coup gagnant (sinon un coup au hasard), selon le niveau. */
const JUSTESSE: Record<NiveauOrdinateur, number> = { 1: 0, 2: 0.25, 3: 0.5, 4: 0.75, 5: 1 };

export const allumettes: Jeu<Etat, Coup, Etat, { depart: number }> = {
  fiche: {
    id: 'allumettes',
    version: 1,
    nom: { fr: 'Allumettes', en: 'Matchsticks' },
    description: { fr: 'Ne prends pas la dernière.', en: "Don't take the last one." },
    icone: '🔥',
    joueursMin: 2,
    joueursMax: 8,
  },
  optionsParDefaut: { depart: 21 },
  etatInitial(joueurs, graine, options) {
    const h = new Hasard(graine);
    return { joueurs: joueurs.length, restantes: options.depart, courant: h.entier(0, joueurs.length - 1), perdant: null };
  },
  joueurCourant: (etat) => etat.courant,
  coupsPermis(etat, joueur) {
    if (etat.perdant !== null || joueur !== etat.courant) return [];
    return ([1, 2, 3] as const).filter((n) => n <= etat.restantes).map((prendre) => ({ prendre }));
  },
  jouer(etat, _joueur, coup) {
    const restantes = etat.restantes - coup.prendre;
    if (restantes === 0) return { ...etat, restantes, perdant: etat.courant };
    return { ...etat, restantes, courant: (etat.courant + 1) % etat.joueurs };
  },
  estFini(etat) {
    if (etat.perdant === null) return null;
    return { gagnants: Array.from({ length: etat.joueurs }, (_, i) => i).filter((i) => i !== etat.perdant) };
  },
  vuePour: (etat) => etat,
  ordinateur(etat, joueur, { niveau, graine }) {
    const h = new Hasard(graine);
    const permis = this.coupsPermis(etat, joueur);
    // Laisser un nombre d'allumettes ≡ 1 (mod 4) : coup gagnant à deux joueurs.
    const gagnant = permis.find((c) => (etat.restantes - c.prendre) % 4 === 1);
    if (gagnant && h.suivant() < JUSTESSE[niveau]) return gagnant;
    return h.choisir(permis);
  },
  async ecran() {
    return class {};
  },
};
