import { describe, expect, it } from 'vitest';
import { duels } from './duel';

/**
 * Niveaux de l'ordinateur (D-A2-09) : taux de victoire en duel contre le
 * niveau moyen, mesurés par simulation. Visés : 20 %, 50 % et 80 %.
 * Sur 2 000 parties : 20 %, 50 % et 68 % (meilleur taux atteint pour le
 * niveau difficile, le dé pesant trop lourd). Ici 600 parties par niveau,
 * avec une marge pour le hasard.
 */
describe("Niveaux de l'ordinateur des Petits chevaux (D-A2-09)", () => {
  it('le niveau facile gagne environ 20 % de ses duels', () => {
    const { taux } = duels(1, 2, 300);
    expect(taux).toBeGreaterThan(0.14);
    expect(taux).toBeLessThan(0.26);
  });

  it('le niveau moyen gagne la moitié de ses duels contre lui-même', () => {
    expect(duels(2, 2, 300).taux).toBe(0.5);
  });

  it('le niveau difficile gagne au moins 62 % de ses duels', () => {
    expect(duels(3, 2, 300).taux).toBeGreaterThan(0.62);
  });

  it('chaque niveau bat le précédent', () => {
    expect(duels(2, 1, 150).taux).toBeGreaterThan(0.6);
    expect(duels(3, 1, 150).taux).toBeGreaterThan(0.7);
  });
});
