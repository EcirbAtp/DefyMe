import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { creerRegistre, problemesFiche, registre } from '../src/noyau/registre';
import { verifierJeu } from '../src/noyau/verification';
import { allumettes } from './exemples/allumettes';

describe('Registre des jeux (D-A1-04, D-A1-05)', () => {
  it('liste les jeux triés par nom dans la langue demandée', () => {
    const autre = { ...allumettes, fiche: { ...allumettes.fiche, id: 'bataille', nom: { fr: 'Bataille', en: 'Beggar my neighbour' } } };
    const r = creerRegistre([allumettes, autre]);
    expect(r.lister('fr').map((j) => j.fiche.id)).toEqual(['allumettes', 'bataille']);
    expect(r.lister('en').map((j) => j.fiche.id)).toEqual(['bataille', 'allumettes']);
    expect(r.trouver('bataille')).toBe(autre);
    expect(r.trouver('inconnu')).toBeUndefined();
  });

  it('refuse un doublon ou une fiche invalide', () => {
    expect(() => creerRegistre([allumettes, allumettes])).toThrow(/deux fois/);
    const mauvais = { ...allumettes, fiche: { ...allumettes.fiche, id: 'Pas Bon' } };
    expect(() => creerRegistre([mauvais])).toThrow(/identifiant invalide/);
    expect(problemesFiche({ ...allumettes, fiche: { ...allumettes.fiche, joueursMin: 5, joueursMax: 3 } })).toContain(
      'joueursMin dépasse joueursMax',
    );
  });

  it("chaque jeu du dossier src/jeux respecte le contrat", () => {
    for (const jeu of registre.lister()) {
      expect(verifierJeu(jeu), jeu.fiche.id).toEqual([]);
    }
    // Des parties complètes entre ordinateurs pour chaque jeu : plus long que les 5 s par défaut.
  }, 120_000);
});

describe('Noyau indépendant des jeux (D-A1-10)', () => {
  it("aucun fichier du noyau, de l'interface ou du stockage n'importe un jeu directement", () => {
    const racine = join(__dirname, '..', 'src');
    for (const dossier of ['noyau', 'ui', 'stockage', 'i18n']) {
      for (const fichier of readdirSync(join(racine, dossier))) {
        const texte = readFileSync(join(racine, dossier, fichier), 'utf8');
        expect(texte, `${dossier}/${fichier}`).not.toMatch(/from ['"][^'"]*jeux\//);
      }
    }
  });
});
