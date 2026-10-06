import { describe, expect, it } from 'vitest';
import jeu from '../src/jeux/huit-americain';
import type { Carte } from '../src/jeux/huit-americain/cartes';
import { niveauDuJeu } from '../src/jeux/huit-americain/ordinateur';
import { OPTIONS_PAR_DEFAUT, nombreDeJeux, vuePour, type Coup, type Etat, type Options } from '../src/jeux/huit-americain/regles';
import type { NiveauOrdinateur } from '../src/noyau/contrat';
import { Hasard } from '../src/noyau/hasard';
import { copieJson } from '../src/noyau/serialisation';
import { verifierJeu } from '../src/noyau/verification';

const joueurs = (n: number) => Array.from({ length: n }, (_, i) => ({ pseudo: `J${i + 1}`, couleur: '#000000' }));
const c = (texte: string): Carte => {
  const couleurs = { P: 'pique', C: 'coeur', K: 'carreau', T: 'trefle' } as const;
  return { rang: texte.slice(0, -1) as Carte['rang'], couleur: couleurs[texte.slice(-1) as keyof typeof couleurs] };
};
const cartes = (texte: string) => (texte ? texte.split(' ').map(c) : []);

/** Une partie à deux joueurs dans une situation choisie : J1 joue, dessus de défausse donné. */
function situation(main1: string, main2: string, dessus: string, modifs: Partial<Etat> = {}): Etat {
  const base = jeu.etatInitial(joueurs(2), 1, OPTIONS_PAR_DEFAUT);
  const haut = c(dessus);
  return {
    ...base,
    mains: [cartes(main1), cartes(main2)],
    pioche: cartes('3T 4T 5T 6T 7T'),
    defausse: [haut],
    couleur: haut.couleur,
    courant: 0,
    ...modifs,
  };
}
const poser = (texte: string, couleur?: Carte['couleur']): Coup =>
  couleur ? { type: 'poser', carte: c(texte), couleur } : { type: 'poser', carte: c(texte) };

describe('Huit américain : contrat (D-C-02, D-A1-02, D-A1-03, D-A1-07)', () => {
  it('respecte le contrat de 2 à 8 joueurs, ordinateurs de tous niveaux compris', () => {
    expect(verifierJeu(jeu)).toEqual([]);
  }, 120_000);

  it('respecte le contrat avec des effets de cartes choisis par le joueur', () => {
    const options: Options = {
      effets: { ...OPTIONS_PAR_DEFAUT.effets, '8': 'aucun', R: 'joker', '7': 'piocher2', '2': 'sauter' },
      cartesParMain: 5,
      cumul: false,
    };
    expect(verifierJeu(jeu, { options, parties: 2 })).toEqual([]);
  }, 120_000);

  it('donne la même partie avec la même graine, et une autre avec une autre graine', () => {
    const a = jeu.etatInitial(joueurs(4), 42, OPTIONS_PAR_DEFAUT);
    expect(jeu.etatInitial(joueurs(4), 42, OPTIONS_PAR_DEFAUT)).toEqual(a);
    expect(jeu.etatInitial(joueurs(4), 43, OPTIONS_PAR_DEFAUT)).not.toEqual(a);
  });
});

describe('Huit américain : mise en place', () => {
  it('distribue 7 cartes, avec un jeu de 52 jusqu’à 5 joueurs et deux au-delà', () => {
    for (let n = 2; n <= 8; n++) {
      const e = jeu.etatInitial(joueurs(n), n, OPTIONS_PAR_DEFAUT);
      const jeux = n <= 5 ? 1 : 2;
      expect(nombreDeJeux(n, 7)).toBe(jeux);
      expect(e.mains.every((m) => m.length === 7)).toBe(true);
      expect(e.mains.flat().length + e.pioche.length + e.defausse.length).toBe(52 * jeux);
    }
  });

  it('retourne une première carte sans effet', () => {
    for (let graine = 0; graine < 200; graine++) {
      const e = jeu.etatInitial(joueurs(3), graine, OPTIONS_PAR_DEFAUT);
      const premiere = e.defausse[0] as Carte;
      expect(OPTIONS_PAR_DEFAUT.effets[premiere.rang]).toBe('aucun');
      expect(e.couleur).toBe(premiere.couleur);
    }
  });

  it('ramène des options incomplètes ou hors bornes à des valeurs valides', () => {
    const e = jeu.etatInitial(joueurs(2), 1, { cartesParMain: 50, effets: { V: 'inconnu' } } as unknown as Options);
    expect(e.options.cartesParMain).toBe(10);
    expect(e.options.effets.V).toBe('sauter');
    expect(e.options.cumul).toBe(true);
  });
});

describe('Huit américain : règles', () => {
  it('permet de poser la même couleur ou la même valeur, et le 8 sur tout avec choix de couleur', () => {
    const e = situation('9P 5C DK 8T', '3P 4P', '9C');
    expect(jeu.coupsPermis(e, 0)).toEqual([
      poser('9P'),
      poser('5C'),
      poser('8T', 'pique'),
      poser('8T', 'coeur'),
      poser('8T', 'carreau'),
      poser('8T', 'trefle'),
    ]);
    expect(jeu.coupsPermis(e, 1)).toEqual([]);
    const apres = jeu.jouer(e, 0, poser('8T', 'carreau'));
    expect(apres.couleur).toBe('carreau');
    expect(apres.courant).toBe(1);
    expect(jeu.coupsPermis(apres, 1)).toEqual([{ type: 'piocher' }]);
  });

  it('fait piocher 2 au suivant avec un 2, et cumule si le suivant pose un 2', () => {
    const e = situation('2C 4P', '2P 3P 5P', '9C');
    const a = jeu.jouer(e, 0, poser('2C'));
    expect(a.penalite).toBe(2);
    expect(jeu.coupsPermis(a, 1)).toEqual([poser('2P'), { type: 'piocher' }]);
    const b = jeu.jouer(a, 1, poser('2P'));
    expect(b.penalite).toBe(4);
    expect(jeu.coupsPermis(b, 0)).toEqual([{ type: 'piocher' }]);
    const d = jeu.jouer(b, 0, { type: 'piocher' });
    expect(d.mains[0]).toHaveLength(5);
    expect(d.penalite).toBe(0);
    expect(d.courant).toBe(1);
  });

  it('ne permet pas de contrer un 2 quand le cumul est désactivé', () => {
    const options = { ...OPTIONS_PAR_DEFAUT, cumul: false };
    const e = situation('2C 4P', '2P 3P 5P', '9C', { options });
    const a = jeu.jouer(e, 0, poser('2C'));
    expect(jeu.coupsPermis(a, 1)).toEqual([{ type: 'piocher' }]);
  });

  it('fait sauter le suivant avec un valet, changer de sens avec un as, rejouer avec un 10', () => {
    const base = jeu.etatInitial(joueurs(4), 1, OPTIONS_PAR_DEFAUT);
    const e: Etat = { ...base, mains: [cartes('VC AC 10C 3C'), cartes('4P'), cartes('5P'), cartes('6P')], defausse: [c('9C')], couleur: 'coeur', courant: 0 };
    expect(jeu.jouer(e, 0, poser('VC')).courant).toBe(2);
    const sens = jeu.jouer(e, 0, poser('AC'));
    expect(sens.sens).toBe(-1);
    expect(sens.courant).toBe(3);
    expect(jeu.jouer(e, 0, poser('10C')).courant).toBe(0);
    expect(jeu.jouer(e, 0, poser('3C')).courant).toBe(1);
  });

  it('applique les effets que le joueur a choisis pour chaque valeur', () => {
    const options: Options = { ...OPTIONS_PAR_DEFAUT, effets: { ...OPTIONS_PAR_DEFAUT.effets, '8': 'aucun', R: 'joker', '7': 'piocher2' } };
    const e = situation('8P RT 7C 4K', '3P', '9C', { options });
    expect(jeu.coupsPermis(e, 0).filter((x) => x.type === 'poser' && x.carte.rang === 'R')).toHaveLength(4);
    expect(jeu.coupsPermis(e, 0).some((x) => x.type === 'poser' && x.carte.rang === '8')).toBe(false);
    expect(jeu.jouer(e, 0, poser('7C')).penalite).toBe(2);
  });

  it('fait piocher une carte sans carte jouable, puis la poser si elle va ou passer', () => {
    const e = situation('4P', '3P', '9C', { pioche: cartes('6T KC') });
    expect(jeu.coupsPermis(e, 0)).toEqual([{ type: 'piocher' }]);
    const a = jeu.jouer(e, 0, { type: 'piocher' });
    expect(a.piochee).toEqual(c('KC'));
    expect(a.courant).toBe(0);
    expect(a.manques[0]).toEqual(['coeur']);
    expect(jeu.coupsPermis(a, 0)).toEqual([poser('KC'), { type: 'passer' }]);
    const b = jeu.jouer(a, 0, { type: 'passer' });
    expect(b.courant).toBe(1);
    expect(b.piochee).toBeNull();
    const d = jeu.jouer(b, 1, { type: 'piocher' });
    expect(jeu.coupsPermis(d, 1)).toEqual([{ type: 'passer' }]);
  });

  it('remélange la défausse quand la pioche est vide', () => {
    const e = situation('4P', '3P', '9C', { pioche: [], defausse: cartes('5K 6K 9C') });
    const a = jeu.jouer(e, 0, { type: 'piocher' });
    expect(a.defausse).toEqual([c('9C')]);
    expect(a.pioche).toHaveLength(1);
    expect(a.mains[0]).toHaveLength(2);
  });

  it('donne la victoire au premier qui n’a plus de cartes, même sur un 8', () => {
    const e = situation('8P', '3P 4P', '9C');
    const fin = jeu.jouer(e, 0, poser('8P', 'coeur'));
    expect(jeu.estFini(fin)).toEqual({ gagnants: [0] });
    expect(jeu.coupsPermis(fin, 0)).toEqual([]);
    expect(jeu.coupsPermis(fin, 1)).toEqual([]);
  });

  it('arrête une partie bloquée (plus rien à piocher, personne ne peut jouer)', () => {
    let e = situation('4P 5P', '3P', '9C', { pioche: [], defausse: [c('9C')] });
    e = jeu.jouer(e, 0, { type: 'passer' });
    expect(jeu.estFini(e)).toBeNull();
    e = jeu.jouer(e, 1, { type: 'passer' });
    expect(jeu.estFini(e)).toEqual({ gagnants: [1] });
  });
});

describe('Huit américain : mains cachées (D-A2-03)', () => {
  /** Toutes les cartes présentes dans une valeur JSON. */
  function cartesVisibles(valeur: unknown): number {
    if (Array.isArray(valeur)) return valeur.reduce((n: number, v) => n + cartesVisibles(v), 0);
    if (valeur && typeof valeur === 'object') {
      if ('rang' in valeur && 'couleur' in valeur) return 1;
      return Object.values(valeur).reduce((n: number, v) => n + cartesVisibles(v), 0);
    }
    return 0;
  }

  it('ne montre à chaque joueur que sa main, la défausse et la carte qu’il vient de piocher', () => {
    const h = new Hasard(9);
    for (const n of [2, 5, 8]) {
      let e = jeu.etatInitial(joueurs(n), n, OPTIONS_PAR_DEFAUT);
      while (!jeu.estFini(e)) {
        for (let j = 0; j < n; j++) {
          const vue = jeu.vuePour(e, j);
          expect(vue.main).toEqual(e.mains[j]);
          expect(vue.nombreCartes).toEqual(e.mains.map((m) => m.length));
          const piochee = j === e.courant && e.piochee ? 1 : 0;
          expect(cartesVisibles(copieJson(vue))).toBe(e.mains[j]!.length + e.defausse.length + 1 + piochee);
        }
        const permis = jeu.coupsPermis(e, e.courant);
        e = jeu.jouer(e, e.courant, h.choisir(permis));
      }
    }
  });
});

describe('Huit américain : ordinateur (D-A2-08, D-A2-09)', () => {
  it('ne regarde pas les cartes cachées : même vue, même graine, même coup', () => {
    const h = new Hasard(3);
    for (let essai = 0; essai < 30; essai++) {
      const e = { ...jeu.etatInitial(joueurs(3), essai, OPTIONS_PAR_DEFAUT), courant: 0 };
      // Mêmes cartes cachées, réparties autrement entre les adversaires et la pioche.
      const cachees = h.melanger([...e.mains[1]!, ...e.mains[2]!, ...e.pioche]);
      const autre: Etat = {
        ...e,
        mains: [e.mains[0]!, cachees.slice(0, 7), cachees.slice(7, 14)],
        pioche: cachees.slice(14),
      };
      expect(vuePour(autre, e.courant).main).toEqual(vuePour(e, e.courant).main);
      for (const niveau of [1, 2, 3] as NiveauOrdinateur[]) {
        const reflexion = { niveau, tempsMaxMs: 1000, graine: essai };
        expect(jeu.ordinateur(autre, e.courant, reflexion)).toEqual(jeu.ordinateur(e, e.courant, reflexion));
      }
    }
  });

  it('ramène tout niveau du contrat à facile, moyen ou difficile', () => {
    expect(niveauDuJeu(1)).toBe(1);
    expect(niveauDuJeu(2)).toBe(2);
    expect(niveauDuJeu(3)).toBe(3);
    expect(niveauDuJeu(5 as NiveauOrdinateur)).toBe(3);
  });

  /** Part de victoires du niveau `a` contre le niveau `b`, en tête-à-tête, chacun commençant à tour de rôle. */
  function tauxDeVictoire(a: NiveauOrdinateur, b: NiveauOrdinateur, parties: number): number {
    let victoires = 0;
    for (let i = 0; i < parties; i++) {
      const inverse = i % 2 === 1;
      const niveaux = inverse ? [b, a] : [a, b];
      const h = new Hasard(1000 + i);
      let e = jeu.etatInitial(joueurs(2), 1000 + i, OPTIONS_PAR_DEFAUT);
      while (!jeu.estFini(e)) {
        const j = jeu.joueurCourant(e);
        e = jeu.jouer(e, j, jeu.ordinateur(e, j, { niveau: niveaux[j]!, tempsMaxMs: 1000, graine: h.graine() }));
      }
      const gagnants = jeu.estFini(e)!.gagnants;
      if (gagnants.includes(inverse ? 1 : 0)) victoires += 1 / gagnants.length;
    }
    return victoires / parties;
  }

  // Mesuré sur 400 à 2 000 parties contre le niveau moyen : facile ≈ 40 %,
  // difficile ≈ 69 %. Le hasard de la donne empêche d'atteindre 20 % et 90 %.
  it('classe les niveaux : facile perd et difficile gagne contre le moyen', () => {
    const facile = tauxDeVictoire(1, 2, 400);
    const difficile = tauxDeVictoire(3, 2, 200);
    expect(facile).toBeLessThan(0.46);
    expect(difficile).toBeGreaterThan(0.58);
    expect(difficile - facile).toBeGreaterThan(0.2);
  }, 120_000);
});
