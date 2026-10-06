import { describe, expect, it } from 'vitest';
import { Hasard, normaliserGraine, nouvelleGraine } from '../src/noyau/hasard';

describe('Hasard (D-A1-07)', () => {
  it('donne la même suite avec la même graine', () => {
    const a = new Hasard(42);
    const b = new Hasard(42);
    const suiteA = Array.from({ length: 50 }, () => a.suivant());
    const suiteB = Array.from({ length: 50 }, () => b.suivant());
    expect(suiteA).toEqual(suiteB);
  });

  it('donne des suites différentes avec des graines différentes', () => {
    expect(new Hasard(1).suivant()).not.toBe(new Hasard(2).suivant());
  });

  it("reprend la suite à partir de l'état rangé dans le jeu", () => {
    const h = new Hasard(7);
    h.suivant();
    const reprise = new Hasard(h.etat);
    expect(reprise.suivant()).toBe(h.suivant());
  });

  it('reste dans les bornes et couvre toutes les faces du dé', () => {
    const h = new Hasard(123);
    const vus = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const d = h.de();
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
      vus.add(d);
    }
    expect(vus.size).toBe(6);
  });

  it('mélange sans perdre ni modifier la liste', () => {
    const cartes = Array.from({ length: 52 }, (_, i) => i);
    const melange = new Hasard(9).melanger(cartes);
    expect(cartes).toEqual(Array.from({ length: 52 }, (_, i) => i));
    expect([...melange].sort((a, b) => a - b)).toEqual(cartes);
    expect(melange).not.toEqual(cartes);
    expect(new Hasard(9).melanger(cartes)).toEqual(melange);
  });

  it('ramène les graines sur 32 bits', () => {
    expect(normaliserGraine(-1)).toBe(4294967295);
    expect(normaliserGraine(2 ** 32 + 5)).toBe(5);
    expect(() => normaliserGraine(Number.NaN)).toThrow();
    const g = nouvelleGraine();
    expect(Number.isInteger(g) && g >= 0 && g < 2 ** 32).toBe(true);
  });

  it('refuse des bornes invalides et une liste vide', () => {
    const h = new Hasard(1);
    expect(() => h.entier(3, 1)).toThrow();
    expect(() => h.choisir([])).toThrow();
  });
});
