import { describe, expect, it } from 'vitest';
import petitsChevaux from '../../src/jeux/petits-chevaux';
import {
  ARRIVEE,
  CENTRE,
  COTES,
  ECURIE,
  LONGUEUR_PARCOURS,
  PARCOURS,
  TAILLE,
  caseDuCheval,
  indexParcours,
} from '../../src/jeux/petits-chevaux/plateau';
import { OPTIONS_PAR_DEFAUT, coupsPermis, deplacement, jouer, type Etat, type Options } from '../../src/jeux/petits-chevaux/regles';
import { verifierJeu } from '../../src/noyau/verification';
import { rejouerPartie, SessionDePartie } from '../../src/noyau/session';

const joueurs = (n: number) => Array.from({ length: n }, (_, i) => ({ pseudo: `J${i + 1}`, couleur: '#000000' }));

/** Un état choisi pour tester une règle : 2 joueurs face à face, dé déjà lancé. */
function etat(chevaux: number[][], de: number | null, options: Partial<Options> = {}): Etat {
  return {
    options: { ...OPTIONS_PAR_DEFAUT, ...options },
    cotes: chevaux.length === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, chevaux.length),
    chevaux,
    courant: 0,
    de,
    hasard: 1,
    gagnant: null,
    dernier: null,
  };
}

const E = ECURIE;

describe('Plateau des Petits chevaux (D-B-03)', () => {
  it('a un parcours de 52 cases distinctes, qui se suivent, dans la grille', () => {
    expect(PARCOURS).toHaveLength(LONGUEUR_PARCOURS);
    expect(new Set(PARCOURS.map((c) => c.join(','))).size).toBe(LONGUEUR_PARCOURS);
    PARCOURS.forEach(([l, c], i) => {
      expect(l >= 0 && l < TAILLE && c >= 0 && c < TAILLE).toBe(true);
      const [l2, c2] = PARCOURS[(i + 1) % LONGUEUR_PARCOURS]!;
      // Voisines par un côté, ou par un coin aux angles de la croix.
      expect(Math.max(Math.abs(l - l2), Math.abs(c - c2))).toBe(1);
    });
  });

  it("place chaque escalier entre sa case d'arrivée et le centre, hors du parcours", () => {
    const parcours = new Set(PARCOURS.map((c) => c.join(',')));
    for (const cote of COTES) {
      expect(cote.escalier).toHaveLength(6);
      for (const marche of cote.escalier) expect(parcours.has(marche.join(','))).toBe(false);
      const [l, c] = cote.escalier[5]!;
      expect(Math.abs(l - 7) + Math.abs(c - 7)).toBe(1);
      expect((cote.arrivee + 2) % LONGUEUR_PARCOURS).toBe(cote.depart);
    }
  });

  it("compte 50 cases de la case de départ à la case d'arrivée", () => {
    COTES.forEach((cote, i) => expect(indexParcours(i, ARRIVEE)).toBe(cote.arrivee));
    expect(caseDuCheval(0, CENTRE, 0)).toEqual([7, 7]);
  });
});

describe('Règles des Petits chevaux (D-C-01, D-A1-03)', () => {
  it('respecte le contrat de jeu, de 2 à 4 joueurs', () => {
    expect(verifierJeu(petitsChevaux)).toEqual([]);
  });

  it('respecte aussi le contrat avec toutes les variantes changées', () => {
    const options: Options = { rejouerSur6: false, surplus: 'bloque', escalier: 'libre', depassement: false, victoire: 'premier' };
    expect(verifierJeu(petitsChevaux, { options, parties: 3 })).toEqual([]);
  });

  it('commence par un lancer de dé, puis propose les chevaux qui peuvent bouger', () => {
    const debut = petitsChevaux.etatInitial(joueurs(3), 42, OPTIONS_PAR_DEFAUT);
    expect(coupsPermis(debut, debut.courant)).toEqual([{ type: 'lancer' }]);
    expect(coupsPermis(debut, (debut.courant + 1) % 3)).toEqual([]);
    const lance = jouer(debut, debut.courant, { type: 'lancer' });
    expect(lance.de).toBeGreaterThanOrEqual(1);
    expect(lance.de).toBeLessThanOrEqual(6);
    expect(lance.dernier).toEqual({ type: 'lancer', joueur: debut.courant, de: lance.de });
  });

  it("ne sort un cheval de l'écurie qu'avec un 6", () => {
    expect(coupsPermis(etat([[E, E, E, E], [E, E, E, E]], 5), 0)).toEqual([{ type: 'passer' }]);
    const coups = coupsPermis(etat([[E, E, E, E], [E, E, E, E]], 6), 0);
    expect(coups).toHaveLength(4);
    const apres = jouer(etat([[E, E, E, E], [E, E, E, E]], 6), 0, { type: 'avancer', cheval: 2 });
    expect(apres.chevaux[0]).toEqual([E, E, 0, E]);
  });

  it('fait rejouer après un 6, sauf si la variante est désactivée', () => {
    const e = etat([[E, E, E, E], [E, E, E, E]], 6);
    expect(jouer(e, 0, { type: 'avancer', cheval: 0 }).courant).toBe(0);
    expect(jouer(etat([[E, E, E, E], [E, E, E, E]], 6, { rejouerSur6: false }), 0, { type: 'avancer', cheval: 0 }).courant).toBe(1);
    expect(jouer(etat([[E, E, E, E], [E, E, E, E]], 3), 0, { type: 'passer' }).courant).toBe(1);
  });

  it("renvoie à l'écurie le cheval adverse sur lequel on tombe", () => {
    // Le joueur 1 part du côté opposé : sa case de départ est 26 cases plus loin.
    const e = etat([[20, E, E, E], [0, E, E, E]], 6);
    expect(deplacement(e, 0, 0, 6)).toEqual({ vers: 26, prise: { joueur: 1, cheval: 0 } });
    const apres = jouer(e, 0, { type: 'avancer', cheval: 0 });
    expect(apres.chevaux[1]).toEqual([E, E, E, E]);
    expect(apres.dernier).toMatchObject({ type: 'avancer', depuis: 20, vers: 26, prise: { joueur: 1, cheval: 0 } });
  });

  it('prend aussi le cheval adverse posé sur la case de départ à la sortie', () => {
    const e = etat([[E, E, E, E], [26, E, E, E]], 6);
    expect(deplacement(e, 0, 0, 6)).toEqual({ vers: 0, prise: { joueur: 1, cheval: 0 } });
  });

  it("interdit de finir sur un cheval de sa couleur", () => {
    const e = etat([[3, 0, E, E], [E, E, E, E]], 3);
    expect(deplacement(e, 0, 1, 3)).toBeNull();
    expect(deplacement(etat([[0, E, E, E], [E, E, E, E]], 6), 0, 1, 6)).toBeNull();
  });

  it("fait reculer du surplus, ou bloque le cheval selon la variante", () => {
    expect(deplacement(etat([[47, E, E, E], [E, E, E, E]], 5), 0, 0, 5)).toEqual({ vers: 48, prise: null });
    expect(deplacement(etat([[47, E, E, E], [E, E, E, E]], 3), 0, 0, 3)).toEqual({ vers: ARRIVEE, prise: null });
    expect(deplacement(etat([[47, E, E, E], [E, E, E, E]], 5, { surplus: 'bloque' }), 0, 0, 5)).toBeNull();
  });

  it("monte l'escalier avec le chiffre exact de chaque marche, puis un 6 pour le centre", () => {
    const pied = etat([[ARRIVEE, E, E, E], [E, E, E, E]], 1);
    expect(deplacement(pied, 0, 0, 1)).toEqual({ vers: ARRIVEE + 1, prise: null });
    expect(deplacement(pied, 0, 0, 2)).toBeNull();
    expect(deplacement(pied, 0, 0, 3)).toBeNull();
    for (let marche = 1; marche <= 5; marche++) {
      const e = etat([[ARRIVEE + marche, E, E, E], [E, E, E, E]], null);
      expect(deplacement(e, 0, 0, marche + 1)).toEqual({ vers: ARRIVEE + marche + 1, prise: null });
      expect(deplacement(e, 0, 0, marche)).toBeNull();
    }
    expect(deplacement(etat([[ARRIVEE + 6, E, E, E], [E, E, E, E]], null), 0, 0, 6)).toEqual({ vers: CENTRE, prise: null });
    // Deux chevaux de la même couleur ne partagent pas une marche.
    expect(deplacement(etat([[ARRIVEE + 1, ARRIVEE + 2, E, E], [E, E, E, E]], null), 0, 0, 2)).toBeNull();
  });

  it("permet la montée libre de l'escalier en variante, avec arrivée pile au centre", () => {
    const e = etat([[ARRIVEE, E, E, E], [E, E, E, E]], 4, { escalier: 'libre' });
    expect(deplacement(e, 0, 0, 4)).toEqual({ vers: ARRIVEE + 4, prise: null });
    expect(deplacement(etat([[ARRIVEE + 4, E, E, E], [E, E, E, E]], 3, { escalier: 'libre' }), 0, 0, 3)).toEqual({ vers: CENTRE, prise: null });
    expect(deplacement(etat([[ARRIVEE + 4, E, E, E], [E, E, E, E]], 4, { escalier: 'libre' }), 0, 0, 4)).toBeNull();
  });

  it('interdit de passer par-dessus un cheval en variante', () => {
    const e = etat([[10, 12, E, E], [E, E, E, E]], 4);
    expect(deplacement(e, 0, 0, 4)).toEqual({ vers: 14, prise: null });
    expect(deplacement({ ...e, options: { ...e.options, depassement: false } }, 0, 0, 4)).toBeNull();
  });

  it('fait gagner celui qui amène ses 4 chevaux au centre, ou le premier en variante', () => {
    const presque = etat([[CENTRE, CENTRE, CENTRE, ARRIVEE + 6], [E, E, E, E]], 6);
    const fin = jouer(presque, 0, { type: 'avancer', cheval: 3 });
    expect(petitsChevaux.estFini(fin)).toEqual({ gagnants: [0] });
    expect(coupsPermis(fin, 0)).toEqual([]);

    const un = etat([[ARRIVEE + 6, E, E, E], [E, E, E, E]], 6);
    expect(petitsChevaux.estFini(jouer(un, 0, { type: 'avancer', cheval: 0 }))).toBeNull();
    expect(petitsChevaux.estFini(jouer({ ...un, options: { ...un.options, victoire: 'premier' } }, 0, { type: 'avancer', cheval: 0 }))).toEqual({
      gagnants: [0],
    });
  });

  it('cache la suite du hasard dans ce que voit chaque joueur (D-A2-03)', () => {
    const e = petitsChevaux.etatInitial(joueurs(2), 7, OPTIONS_PAR_DEFAUT);
    expect(petitsChevaux.vuePour(e, 0)).not.toHaveProperty('hasard');
  });

  it("rejoue une partie à l'identique avec la même graine et les mêmes coups (D-A1-07)", () => {
    const places = joueurs(4).map((joueur, i) => ({ joueur, controle: { type: 'ordinateur' as const, niveau: ((i % 3) + 1) as 1 | 2 | 3 } }));
    const s = SessionDePartie.creer(petitsChevaux, places, { graine: 2026 });
    s.faireJouerOrdinateurs();
    expect(s.fin).not.toBeNull();
    expect(rejouerPartie(petitsChevaux, joueurs(4), 2026, OPTIONS_PAR_DEFAUT, s.coups)).toEqual(s.etat);
  });

  it('reprend une partie sauvegardée au même coup (D-D-09)', () => {
    const places = [
      { joueur: joueurs(1)[0]!, controle: { type: 'humain' as const } },
      { joueur: joueurs(2)[1]!, controle: { type: 'ordinateur' as const, niveau: 2 as const } },
    ];
    const s = SessionDePartie.creer(petitsChevaux, places, { graine: 9 });
    for (let i = 0; i < 40 && !s.fin; i++) {
      if (s.auTourDeLOrdinateur) s.faireJouerOrdinateur();
      else s.proposerCoup(0, s.coupsPermis(0)[0]!);
    }
    const sauvegarde = JSON.parse(JSON.stringify(s.sauvegarder()));
    const reprise = SessionDePartie.reprendre(petitsChevaux, sauvegarde);
    expect(reprise.etat).toEqual(s.etat);
    expect(reprise.coups).toEqual(s.coups);
  });
});
