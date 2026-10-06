import { describe, expect, it } from 'vitest';
import { COULEURS, ecrireReglages, lireReglages, nettoyerPseudo, type Stockage } from '../src/stockage/reglages';

function memoire(): Stockage & { donnees: Map<string, string> } {
  const donnees = new Map<string, string>();
  return { donnees, getItem: (c) => donnees.get(c) ?? null, setItem: (c, v) => void donnees.set(c, v) };
}

describe('Réglages locaux (D-D-03, D-D-08)', () => {
  it('donne des valeurs par défaut au premier lancement, dans la langue du téléphone', () => {
    expect(lireReglages(memoire(), 'en')).toEqual({ pseudo: '', couleur: COULEURS[0], son: true, langue: 'en' });
  });

  it('relit ce qui a été enregistré', () => {
    const s = memoire();
    const r = { pseudo: 'Fab', couleur: COULEURS[3], son: false, langue: 'fr' as const };
    expect(ecrireReglages(s, r)).toBe(true);
    expect(lireReglages(s, 'en')).toEqual(r);
  });

  it('ignore un contenu abîmé ou des valeurs inconnues', () => {
    const s = memoire();
    s.setItem('defyme.reglages.v1', '{pas du json');
    expect(lireReglages(s, 'fr').pseudo).toBe('');
    s.setItem('defyme.reglages.v1', JSON.stringify({ pseudo: 3, couleur: '#123456', son: 'oui', langue: 'de' }));
    expect(lireReglages(s, 'fr')).toEqual({ pseudo: '', couleur: COULEURS[0], son: true, langue: 'fr' });
  });

  it('survit à un stockage indisponible (navigation privée)', () => {
    const casse: Stockage = {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('refusé');
      },
    };
    expect(lireReglages(casse, 'fr').langue).toBe('fr');
    expect(ecrireReglages(casse, lireReglages(casse, 'fr'))).toBe(false);
    expect(ecrireReglages(undefined, lireReglages(undefined, 'fr'))).toBe(false);
  });

  it('nettoie le pseudo et le limite à 16 caractères', () => {
    expect(nettoyerPseudo('  Le   roi  ')).toBe('Le roi');
    expect(nettoyerPseudo('a'.repeat(30))).toHaveLength(16);
    expect([...nettoyerPseudo('🎲'.repeat(20))]).toHaveLength(16);
  });

  it('ne garde que 8 couleurs distinctes, une par joueur', () => {
    expect(new Set(COULEURS).size).toBe(8);
  });
});
