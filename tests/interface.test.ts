import { beforeEach, describe, expect, it } from 'vitest';
import { changerLangue } from '../src/i18n';
import { creerRegistre } from '../src/noyau/registre';
import type { Stockage } from '../src/stockage/reglages';
import { demarrerAppli } from '../src/ui/app';
import { allumettes } from './exemples/allumettes';

function memoire(): Stockage {
  const d = new Map<string, string>();
  return { getItem: (c) => d.get(c) ?? null, setItem: (c, v) => void d.set(c, v) };
}

function demarrer(jeux = [allumettes], stockage = memoire()) {
  const racine = document.createElement('div');
  document.body.replaceChildren(racine);
  const appli = demarrerAppli(racine, { registre: creerRegistre(jeux), stockage, langueDuTelephone: 'fr', version: '0.1.0' });
  return { racine, appli, stockage };
}

function aller(appli: { afficher(): void }, hash: string) {
  location.hash = hash;
  appli.afficher();
}

describe('Coquille de l’appli (D-D-01, D-D-02)', () => {
  beforeEach(() => {
    location.hash = '';
    changerLangue('fr');
  });

  it('ouvre directement le menu Jeux, sans inscription, avec deux onglets seulement', () => {
    const { racine } = demarrer();
    const onglets = [...racine.querySelectorAll('nav a')].map((a) => a.textContent);
    expect(onglets).toEqual(['Jeux', 'Paramètres']);
    expect(racine.querySelector('h1')?.textContent).toBe('Jeux');
    expect(racine.querySelector('input[type="password"], input[type="email"]')).toBeNull();
  });

  it('construit le menu Jeux depuis le registre (D-A1-04)', () => {
    const { racine } = demarrer();
    const carte = racine.querySelector('[data-jeu="allumettes"]');
    expect(carte?.textContent).toContain('Allumettes');
    expect(carte?.textContent).toContain('2 à 8 joueurs');
  });

  it("affiche un message quand aucun jeu n'est encore disponible", () => {
    const { racine } = demarrer([]);
    expect(racine.querySelector('.vide')?.textContent).toMatch(/Petits chevaux/);
  });

  it('enregistre les paramètres sur le téléphone et change de langue (D-D-03)', () => {
    const { racine, appli, stockage } = demarrer();
    aller(appli, '#/parametres');
    expect(racine.querySelector('h1')?.textContent).toBe('Paramètres');

    const pseudo = racine.querySelector<HTMLInputElement>('#pseudo')!;
    pseudo.value = '  Fab  ';
    pseudo.dispatchEvent(new Event('change'));
    expect(appli.reglages().pseudo).toBe('Fab');

    const langue = racine.querySelector<HTMLSelectElement>('#langue')!;
    langue.value = 'en';
    langue.dispatchEvent(new Event('change'));
    expect(racine.querySelector('h1')?.textContent).toBe('Settings');
    expect([...racine.querySelectorAll('nav a')].map((a) => a.textContent)).toEqual(['Games', 'Settings']);
    expect(JSON.parse(stockage.getItem('defyme.reglages.v1')!)).toMatchObject({ pseudo: 'Fab', langue: 'en' });
  });

  it('propose les 8 couleurs, appliquées à l’interface, et le son', () => {
    const { racine, appli } = demarrer();
    aller(appli, '#/parametres');
    const couleurs = racine.querySelectorAll<HTMLInputElement>('input[name="couleur"]');
    expect(couleurs).toHaveLength(8);
    couleurs[3]!.checked = true;
    couleurs[3]!.dispatchEvent(new Event('change'));
    expect(appli.reglages().couleur).toBe('#fdd835');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#fdd835');
    expect(document.documentElement.style.getPropertyValue('--accent-texte')).toBe('#000000');

    const son = racine.querySelector<HTMLInputElement>('#son')!;
    son.checked = false;
    son.dispatchEvent(new Event('change'));
    expect(appli.reglages().son).toBe(false);
  });

  it("ouvre la page d'un jeu et revient au menu pour un jeu inconnu", () => {
    const { racine, appli } = demarrer();
    aller(appli, '#/jeu/allumettes');
    expect(racine.querySelector('h1')?.textContent).toContain('Allumettes');
    aller(appli, '#/jeu/inconnu');
    expect(racine.querySelector('h1')?.textContent).toBe('Jeux');
  });
});
