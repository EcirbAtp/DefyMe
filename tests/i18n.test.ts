import { describe, expect, it } from 'vitest';
import { TRADUCTIONS, changerLangue, langueDuTelephone, t } from '../src/i18n';
import { LANGUES } from '../src/noyau/contrat';

describe('Traductions (DC-7, D-D-05)', () => {
  it('chaque langue a les mêmes clés, toutes remplies', () => {
    const cles = Object.keys(TRADUCTIONS.fr).sort();
    for (const langue of LANGUES) {
      expect(Object.keys(TRADUCTIONS[langue]).sort(), langue).toEqual(cles);
      for (const [cle, texte] of Object.entries(TRADUCTIONS[langue])) expect(texte.trim(), `${langue}:${cle}`).not.toBe('');
    }
  });

  it('chaque langue garde les mêmes {variables}', () => {
    const variables = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [cle, texte] of Object.entries(TRADUCTIONS.fr)) {
      for (const langue of LANGUES) {
        expect(variables(TRADUCTIONS[langue][cle as keyof typeof TRADUCTIONS.fr]), `${langue}:${cle}`).toEqual(variables(texte));
      }
    }
  });

  it('remplace les variables et suit la langue choisie', () => {
    changerLangue('en');
    expect(t('jeux.joueurs', { min: 2, max: 4 })).toBe('2 to 4 players');
    changerLangue('fr');
    expect(t('jeux.joueurs', { min: 2, max: 4 })).toBe('2 à 4 joueurs');
  });

  it('choisit la langue du téléphone au premier lancement (D-D-04)', () => {
    expect(langueDuTelephone(['fr-FR', 'en'])).toBe('fr');
    expect(langueDuTelephone(['de-DE', 'en-GB'])).toBe('en');
    expect(langueDuTelephone(['fr-CA'])).toBe('fr');
    expect(langueDuTelephone(['es-ES'])).toBe('en');
    expect(langueDuTelephone([])).toBe('en');
  });
});
