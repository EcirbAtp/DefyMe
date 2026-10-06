import type { NiveauOrdinateur } from '../../src/noyau/contrat';
import { Hasard } from '../../src/noyau/hasard';
import petitsChevaux from '../../src/jeux/petits-chevaux';
import { OPTIONS_PAR_DEFAUT, type Options } from '../../src/jeux/petits-chevaux/regles';

export interface Bilan {
  victoires: number;
  parties: number;
  taux: number;
  coupsMoyens: number;
}

/**
 * Duels entre deux niveaux d'ordinateur. Chaque graine est jouée deux fois,
 * en échangeant les places, pour effacer l'avantage du premier joueur.
 */
export function duels(niveau: NiveauOrdinateur, contre: NiveauOrdinateur, paires: number, options: Options = OPTIONS_PAR_DEFAUT): Bilan {
  const jeu = petitsChevaux;
  const joueurs = [
    { pseudo: 'A', couleur: '#000000' },
    { pseudo: 'B', couleur: '#ffffff' },
  ];
  const graines = new Hasard(2026);
  let victoires = 0;
  let coups = 0;
  for (let i = 0; i < paires; i++) {
    const graine = graines.graine();
    for (const place of [0, 1]) {
      const niveaux = place === 0 ? [niveau, contre] : [contre, niveau];
      let etat = jeu.etatInitial(joueurs, graine, options);
      const h = new Hasard(graine ^ 0x5bd1e995);
      while (!jeu.estFini(etat)) {
        const j = jeu.joueurCourant(etat);
        etat = jeu.jouer(etat, j, jeu.ordinateur(etat, j, { niveau: niveaux[j]!, tempsMaxMs: 200, graine: h.graine() }));
        coups++;
      }
      if (jeu.estFini(etat)!.gagnants.includes(place)) victoires++;
    }
  }
  return { victoires, parties: paires * 2, taux: victoires / (paires * 2), coupsMoyens: coups / (paires * 2) };
}
