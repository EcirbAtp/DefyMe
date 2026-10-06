import { describe, expect, it } from 'vitest';
import { COULEURS } from '../src/stockage/reglages';
import { texteLisibleSur } from '../src/ui/couleur';

describe('Couleur du joueur dans l’interface', () => {
  it('écrit en noir sur une couleur claire et en blanc sur une couleur foncée', () => {
    expect(texteLisibleSur('#fdd835')).toBe('#000000');
    expect(texteLisibleSur('#6d4c41')).toBe('#ffffff');
    expect(texteLisibleSur('#ffffff')).toBe('#000000');
    expect(texteLisibleSur('#000000')).toBe('#ffffff');
  });

  it('garde un contraste lisible (au moins 3:1) pour chacune des 8 couleurs', () => {
    const lum = (hex: string) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i]!, 0);
    for (const couleur of COULEURS) {
      const [a, b] = [lum(couleur), lum(texteLisibleSur(couleur))].sort((x, y) => y - x) as [number, number];
      expect((a + 0.05) / (b + 0.05), couleur).toBeGreaterThanOrEqual(3);
    }
  });
});
