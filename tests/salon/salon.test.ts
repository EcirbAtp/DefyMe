import { describe, expect, it } from 'vitest';
import petitsChevaux from '../../src/jeux/petits-chevaux';
import type { FicheJeu } from '../../src/noyau/contrat';
import { creerRegistre } from '../../src/noyau/registre';
import { verifierJeu } from '../../src/noyau/verification';
import {
  catalogue,
  codeDansAdresse,
  composerPartie,
  couleursDistinctes,
  etatLancement,
  lienSalon,
  lireDonneesLancement,
  normaliserCode,
  peutAjouterRobot,
  placesMax,
  robotsGardes,
} from '../../src/salon/salon';
import { COULEURS } from '../../src/stockage/reglages';
import { allumettes } from '../exemples/allumettes';

const fiche = petitsChevaux.fiche;
const joueur = (pseudo: string, couleur: string = COULEURS[0]) => ({ pseudo, couleur });

describe('Petits chevaux, jeu du salon', () => {
  it('respecte le contrat de jeu', () => {
    expect(verifierJeu(petitsChevaux)).toEqual([]);
  });
});

describe('code et lien du salon (D-A3-01, D-A3-02)', () => {
  it('nettoie un code tapé et refuse un code mal formé', () => {
    expect(normaliserCode(' k7q2 ')).toBe('K7Q2');
    expect(normaliserCode('K7 Q2')).toBe('K7Q2');
    for (const mauvais of ['', 'K7Q', 'K7Q22', 'K7-2', null, undefined]) expect(normaliserCode(mauvais)).toBeNull();
  });

  it("met dans le QR code l'adresse de l'appli avec le code, et la relit", () => {
    const lien = lienSalon('https://ecirbatp.github.io/DefyMe/#/salon/petits-chevaux', 'K7Q2');
    expect(lien).toBe('https://ecirbatp.github.io/DefyMe/?salon=K7Q2');
    expect(codeDansAdresse(lien)).toBe('K7Q2');
    expect(lienSalon('http://localhost:5173/DefyMe/?salon=AAAA#/jeux', 'BCDE')).toBe('http://localhost:5173/DefyMe/?salon=BCDE');
    expect(codeDansAdresse('https://ecirbatp.github.io/DefyMe/?salon=k7q2')).toBe('K7Q2');
    expect(codeDansAdresse('https://ecirbatp.github.io/DefyMe/')).toBeNull();
    expect(codeDansAdresse('https://ecirbatp.github.io/DefyMe/?salon=<script>')).toBeNull();
    expect(codeDansAdresse('pas une adresse')).toBeNull();
  });
});

describe('places et lancement (D-A3-03, D-A3-04)', () => {
  it('compte les places du jeu, sans dépasser 8', () => {
    expect(placesMax(fiche)).toBe(4);
    expect(placesMax({ ...fiche, joueursMax: 12 } as FicheJeu)).toBe(8);
  });

  it('ne lance qu’avec un nombre de joueurs accepté par le jeu', () => {
    expect(etatLancement(fiche, 1, 0)).toEqual({ possible: false, raison: 'pas-assez', manque: 1 });
    expect(etatLancement(fiche, 1, 1)).toEqual({ possible: true });
    expect(etatLancement(fiche, 2, 0)).toEqual({ possible: true });
    expect(etatLancement(fiche, 4, 0)).toEqual({ possible: true });
    expect(etatLancement(fiche, 3, 2)).toEqual({ possible: false, raison: 'trop', enTrop: 1 });
    expect(etatLancement({ ...fiche, joueursMin: 3 }, 1, 0)).toMatchObject({ manque: 2 });
  });

  it('remplit les places vides avec des robots, et les humains passent avant', () => {
    expect(peutAjouterRobot(fiche, 1, 2)).toBe(true);
    expect(peutAjouterRobot(fiche, 1, 3)).toBe(false);
    const robots = [{ niveau: 1 as const }, { niveau: 2 as const }, { niveau: 3 as const }];
    expect(robotsGardes(fiche, 1, robots)).toEqual(robots);
    expect(robotsGardes(fiche, 2, robots)).toEqual(robots.slice(0, 2));
    expect(robotsGardes(fiche, 4, robots)).toEqual([]);
  });
});

describe('composition de la partie', () => {
  it('donne une couleur différente à chacun, en gardant la sienne quand elle est libre', () => {
    expect(couleursDistinctes(['#e53935', '#e53935', '#1e88e5', ''], COULEURS)).toEqual(['#e53935', '#43a047', '#1e88e5', '#fdd835']);
  });

  it("place l'hôte, puis les invités, puis les robots", () => {
    const participants = [
      { id: 0, joueur: joueur('Hôte') },
      { id: 3, joueur: joueur('Ana') },
      { id: 5, joueur: joueur('Bob', COULEURS[2]) },
    ];
    const c = composerPartie(participants, [{ niveau: 3 }], (n) => `Ordi ${n}`, COULEURS);
    expect(c.places.map((p) => p.joueur.pseudo)).toEqual(['Hôte', 'Ana', 'Bob', 'Ordi 1']);
    expect(c.places.map((p) => p.controle)).toEqual([{ type: 'humain' }, { type: 'humain' }, { type: 'humain' }, { type: 'ordinateur', niveau: 3 }]);
    expect(new Set(c.places.map((p) => p.joueur.couleur)).size).toBe(4);
    expect([...c.placeDesInvites]).toEqual([
      [3, 1],
      [5, 2],
    ]);
    expect(c.donnees.joueurs.map((j) => j.robot)).toEqual([false, false, false, true]);
    expect(JSON.parse(JSON.stringify(c.donnees))).toEqual(c.donnees);
  });

  it('lit les données de lancement sans les croire sur parole', () => {
    expect(lireDonneesLancement(null)).toEqual({ joueurs: [] });
    expect(lireDonneesLancement({ joueurs: 'x' })).toEqual({ joueurs: [] });
    expect(lireDonneesLancement({ joueurs: [{ pseudo: 'Ana', couleur: '#000000' }, { pseudo: 3 }] })).toEqual({
      joueurs: [
        { pseudo: 'Ana', couleur: '#000000', robot: false },
        { pseudo: '?', couleur: '#888888', robot: false },
      ],
    });
  });

  it('annonce à l’entrée tous les jeux du téléphone avec leur version (D-A1-08)', () => {
    expect(catalogue(creerRegistre([petitsChevaux, allumettes]))).toEqual({ 'petits-chevaux': 1, allumettes: allumettes.fiche.version });
  });
});
