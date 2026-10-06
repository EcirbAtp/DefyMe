import { describe, expect, it } from 'vitest';
import { SessionDePartie, rejouerPartie, type Place } from '../src/noyau/session';
import { allumettes } from './exemples/allumettes';

const humain = (pseudo: string): Place => ({ joueur: { pseudo, couleur: '#e53935' }, controle: { type: 'humain' } });
const ordi = (pseudo: string, niveau: 1 | 2 | 3 | 4 | 5 = 3): Place => ({
  joueur: { pseudo, couleur: '#1e88e5' },
  controle: { type: 'ordinateur', niveau },
});

describe('Session de partie', () => {
  it('refuse un nombre de joueurs hors des limites du jeu (D-A3-04, D-A2-01)', () => {
    expect(() => SessionDePartie.creer(allumettes, [humain('A')])).toThrow(/2 à 8/);
    const neuf = Array.from({ length: 9 }, (_, i) => humain(`J${i}`));
    expect(() => SessionDePartie.creer(allumettes, neuf)).toThrow();
    expect(() => SessionDePartie.creer(allumettes, neuf.slice(0, 8))).not.toThrow();
  });

  it('valide chaque coup par le contrat (D-A2-02)', () => {
    const s = SessionDePartie.creer(allumettes, [humain('A'), humain('B')], { graine: 5 });
    const courant = s.joueurCourant;
    const autre = 1 - courant;
    expect(s.proposerCoup(autre, { prendre: 1 })).toEqual({ ok: false, raison: 'pas-ton-tour' });
    expect(s.proposerCoup(courant, { prendre: 4 } as never)).toEqual({ ok: false, raison: 'coup-interdit' });
    expect(s.proposerCoup(7, { prendre: 1 })).toEqual({ ok: false, raison: 'place-inconnue' });
    expect(s.proposerCoup(courant, { prendre: 2 })).toEqual({ ok: true });
    expect(s.etat.restantes).toBe(19);
    expect(s.joueurCourant).toBe(autre);
  });

  it('accepte un coup arrivé du réseau, avec ses clés dans un autre ordre', () => {
    const s = SessionDePartie.creer(allumettes, [humain('A'), humain('B')], { graine: 5 });
    const recu = JSON.parse('{"prendre":3}') as { prendre: 3 };
    expect(s.proposerCoup(s.joueurCourant, recu).ok).toBe(true);
  });

  it("fait jouer les ordinateurs jusqu'au tour d'un humain (D-A2-07, D-A2-08)", () => {
    const s = SessionDePartie.creer(allumettes, [humain('A'), ordi('B'), ordi('C')], { graine: 11 });
    s.faireJouerOrdinateurs();
    expect(s.fin !== null || s.joueurCourant === 0).toBe(true);
  });

  it('mène une partie entre ordinateurs à son terme', () => {
    const s = SessionDePartie.creer(allumettes, [ordi('A', 1), ordi('B', 5), ordi('C', 3)], { graine: 3 });
    s.faireJouerOrdinateurs();
    expect(s.fin).not.toBeNull();
    expect(s.proposerCoup(0, { prendre: 1 })).toEqual({ ok: false, raison: 'partie-finie' });
    expect(s.faireJouerOrdinateur()).toBe(false);
  });

  it('rejoue une partie à l’identique avec la même graine (D-A1-07)', () => {
    const places = [ordi('A', 2), ordi('B', 4)];
    const a = SessionDePartie.creer(allumettes, places, { graine: 77 });
    const b = SessionDePartie.creer(allumettes, places, { graine: 77 });
    a.faireJouerOrdinateurs();
    b.faireJouerOrdinateurs();
    expect(b.coups).toEqual(a.coups);
    const rejoue = rejouerPartie(allumettes, places.map((p) => p.joueur), 77, allumettes.optionsParDefaut, a.coups);
    expect(rejoue).toEqual(a.etat);
  });

  it('remplace un joueur parti par un ordinateur puis lui rend la main (D-A2-04)', () => {
    const s = SessionDePartie.creer(allumettes, [humain('A'), humain('B')], { graine: 1 });
    const courant = s.joueurCourant;
    expect(s.auTourDeLOrdinateur).toBe(false);
    s.changerControle(courant, { type: 'ordinateur', niveau: 3 });
    expect(s.faireJouerOrdinateur()).toBe(true);
    s.changerControle(courant, { type: 'humain' });
    expect(s.places[courant]?.controle).toEqual({ type: 'humain' });
  });

  it('sauvegarde en JSON et reprend la partie au même point (D-D-09, D-A2-05)', () => {
    const s = SessionDePartie.creer(allumettes, [humain('A'), ordi('B')], { graine: 21 });
    if (s.joueurCourant === 0) s.proposerCoup(0, { prendre: 1 });
    s.faireJouerOrdinateur();
    const texte = JSON.stringify(s.sauvegarder());
    const reprise = SessionDePartie.reprendre(allumettes, JSON.parse(texte));
    expect(reprise.etat).toEqual(s.etat);
    expect(reprise.coups).toEqual(s.coups);
    // Le hasard de l'ordinateur continue aussi à l'identique.
    reprise.proposerCoup(reprise.joueurCourant, { prendre: 1 });
    s.proposerCoup(s.joueurCourant, { prendre: 1 });
    reprise.faireJouerOrdinateurs();
    s.faireJouerOrdinateurs();
    expect(reprise.coups).toEqual(s.coups);
  });

  it("refuse une sauvegarde d'un autre jeu ou d'une autre version", () => {
    const sauvegarde = SessionDePartie.creer(allumettes, [humain('A'), humain('B')], { graine: 1 }).sauvegarder();
    expect(() => SessionDePartie.reprendre(allumettes, { ...sauvegarde, jeu: { id: 'autre', version: 1 } })).toThrow();
    expect(() => SessionDePartie.reprendre(allumettes, { ...sauvegarde, jeu: { id: 'allumettes', version: 2 } })).toThrow();
  });

  it('prévient les écouteurs à chaque coup', () => {
    const s = SessionDePartie.creer(allumettes, [humain('A'), humain('B')], { graine: 1 });
    const recus: number[] = [];
    const arreter = s.ecouter((c) => recus.push(c.coup.joueur));
    const premier = s.joueurCourant;
    s.proposerCoup(premier, { prendre: 1 });
    arreter();
    s.proposerCoup(s.joueurCourant, { prendre: 1 });
    expect(recus).toEqual([premier]);
  });

  it('ne garde pas de lien avec les places passées à la création', () => {
    const places = [humain('A'), humain('B')];
    const s = SessionDePartie.creer(allumettes, places, { graine: 1 });
    places[0]!.joueur.pseudo = 'modifié';
    expect(s.places[0]?.joueur.pseudo).toBe('A');
  });
});
