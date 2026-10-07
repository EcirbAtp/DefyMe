import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changerLangue } from '../src/i18n';
import jeu from '../src/jeux/huit-americain';
import { memeCarte, type Carte } from '../src/jeux/huit-americain/cartes';
import {
  CARTE_MAIN,
  TACTILE_MIN,
  ZONE_MAIN,
  actionCarte,
  cartesSpeciales,
  coupAvecCouleur,
  disposerMain,
  evenement,
  mainAffichee,
  ordreAdversaires,
  pageDeCarte,
  passeForcee,
  peutPasser,
  peutPiocher,
  texteEvenement,
  texteStatut,
} from '../src/jeux/huit-americain/presentation';
import { OPTIONS_PAR_DEFAUT, coupsDeLaVue, vuePour, type Coup, type Etat, type Vue } from '../src/jeux/huit-americain/regles';
import { THEME_PAR_DEFAUT } from '../src/jeux/huit-americain/theme';
import { ECRAN, LANGUES, type DonneesEcran } from '../src/noyau/contrat';
import { Hasard } from '../src/noyau/hasard';
import { creerRegistre } from '../src/noyau/registre';
import { copieJson } from '../src/noyau/serialisation';
import { reglagesParDefaut } from '../src/stockage/reglages';
import { afficherPageJeu, cleSauvegarde, quitterPartie, type ContextePartie } from '../src/ui/partie';

const joueurs = (n: number) => Array.from({ length: n }, (_, i) => ({ pseudo: `J${i + 1}`, couleur: '#000000' }));
const c = (texte: string): Carte => {
  const couleurs = { P: 'pique', C: 'coeur', K: 'carreau', T: 'trefle' } as const;
  return { rang: texte.slice(0, -1) as Carte['rang'], couleur: couleurs[texte.slice(-1) as keyof typeof couleurs] };
};
const cartes = (texte: string) => (texte ? texte.split(' ').map(c) : []);
const symboles = THEME_PAR_DEFAUT.symboles;

/** Partie à `n` joueurs où J1 a la main, avec le dessus de défausse donné. */
function situation(mains: string[], dessus: string, modifs: Partial<Etat> = {}): Etat {
  const base = jeu.etatInitial(joueurs(mains.length), 1, OPTIONS_PAR_DEFAUT);
  const haut = c(dessus);
  return { ...base, mains: mains.map(cartes), pioche: cartes('3T 4T 5T 6T 7T'), defausse: [haut], couleur: haut.couleur, courant: 0, ...modifs };
}

/** Parcourt des parties jouées au hasard et appelle `f` sur chaque vue de chaque joueur. */
function pourChaqueVue(f: (vue: Vue, etat: Etat) => void): void {
  const h = new Hasard(5);
  for (const n of [2, 4, 8]) {
    let e = jeu.etatInitial(joueurs(n), n * 11, OPTIONS_PAR_DEFAUT);
    while (!jeu.estFini(e)) {
      for (let j = 0; j < n; j++) f(vuePour(e, j), e);
      e = jeu.jouer(e, e.courant, h.choisir(jeu.coupsPermis(e, e.courant)));
    }
    for (let j = 0; j < n; j++) f(vuePour(e, j), e);
  }
}

describe('Huit américain, présentation : cartes jouables', () => {
  it('calcule depuis la vue les mêmes coups que les règles', () => {
    pourChaqueVue((vue, etat) => expect(coupsDeLaVue(vue)).toEqual(jeu.coupsPermis(etat, vue.joueur)));
  });

  it('met en évidence exactement les cartes que le joueur peut poser', () => {
    pourChaqueVue((vue, etat) => {
      const permis = jeu.coupsPermis(etat, vue.joueur);
      for (const carte of mainAffichee(vue)) {
        const attendu = permis.some((p) => p.type === 'poser' && memeCarte(p.carte, carte.carte));
        expect(carte.jouable).toBe(attendu);
      }
      if (vue.courant !== vue.joueur || vue.gagnants !== null) expect(mainAffichee(vue).some((x) => x.jouable)).toBe(false);
      expect(peutPiocher(vue)).toBe(permis.some((p) => p.type === 'piocher'));
      expect(peutPasser(vue)).toBe(permis.some((p) => p.type === 'passer'));
    });
  });

  it('joue directement une carte simple et fait choisir la couleur après un 8', () => {
    const vue = vuePour(situation(['9P 5C DK 8T', '3P'], '9C'), 0);
    const main = mainAffichee(vue);
    expect(main.map((x) => x.jouable)).toEqual([true, true, false, true]);
    expect(actionCarte(main[0]!)).toEqual({ type: 'coup', coup: { type: 'poser', carte: c('9P') } });
    expect(actionCarte(main[2]!)).toEqual({ type: 'rien' });
    const huit = actionCarte(main[3]!);
    expect(huit.type).toBe('couleur');
    if (huit.type !== 'couleur') return;
    expect(huit.coups).toHaveLength(4);
    expect(coupAvecCouleur(huit.coups, 'carreau')).toEqual({ type: 'poser', carte: c('8T'), couleur: 'carreau' });
  });

  it('suit les variantes : le roi devient joker, le 8 redevient une carte simple', () => {
    const options = { ...OPTIONS_PAR_DEFAUT, effets: { ...OPTIONS_PAR_DEFAUT.effets, '8': 'aucun' as const, R: 'joker' as const } };
    const vue = vuePour(situation(['8T RT', '3P'], '9C', { options }), 0);
    const [huit, roi] = mainAffichee(vue);
    expect(huit!.jouable).toBe(false);
    expect(actionCarte(roi!).type).toBe('couleur');
    expect(cartesSpeciales(options).find((g) => g.effet === 'joker')!.rangs).toEqual(['R']);
  });

  it('pendant une pénalité, seules les cartes +2 sont jouables, et la pioche reste possible', () => {
    const vue = vuePour(situation(['2C 4P 9C', '3P'], '2K', { penalite: 2 }), 0);
    expect(mainAffichee(vue).map((x) => x.jouable)).toEqual([true, false, false]);
    expect(peutPiocher(vue)).toBe(true);
    const sansCumul = vuePour(situation(['2C 4P'], '2K', { penalite: 2, options: { ...OPTIONS_PAR_DEFAUT, cumul: false } }), 0);
    expect(mainAffichee(sansCumul).some((x) => x.jouable)).toBe(false);
  });

  it('marque la carte piochée et passe tout seul si elle ne va pas', () => {
    const e = jeu.jouer(situation(['4P', '3P'], '9C', { pioche: cartes('6T KC') }), 0, { type: 'piocher' });
    const vue = vuePour(e, 0);
    expect(mainAffichee(vue).find((x) => x.piochee)!.carte).toEqual(c('KC'));
    expect(passeForcee(vue)).toBe(false);
    const e2 = jeu.jouer(situation(['4P', '3P'], '9C', { pioche: cartes('6T KT') }), 0, { type: 'piocher' });
    expect(passeForcee(vuePour(e2, 0))).toBe(true);
  });
});

describe('Huit américain, présentation : disposition (D-C-04)', () => {
  it('place les adversaires dans l’ordre de la table, en partant du suivant', () => {
    const e = { ...jeu.etatInitial(joueurs(4), 1, OPTIONS_PAR_DEFAUT), courant: 0 };
    expect(ordreAdversaires(vuePour(e, 2))).toEqual([3, 0, 1]);
    expect(ordreAdversaires(vuePour({ ...e, sens: -1 }, 2))).toEqual([3, 0, 1]);
    expect(ordreAdversaires(vuePour(e, 0))).toEqual([1, 2, 3]);
  });

  it('montre toute la main, dans l’écran, avec des cartes assez larges pour le doigt', () => {
    for (let n = 1; n <= 40; n++) {
      const vus: number[] = [];
      const { pages } = disposerMain(n);
      for (let page = 0; page < pages; page++) {
        const d = disposerMain(n, page);
        expect(d.page).toBe(page);
        expect(d.pas).toBeGreaterThanOrEqual(TACTILE_MIN);
        for (const p of d.places) {
          vus.push(p.index);
          expect(p.x - CARTE_MAIN.largeur / 2).toBeGreaterThanOrEqual(0);
          expect(p.x + CARTE_MAIN.largeur / 2).toBeLessThanOrEqual(ECRAN.largeur);
          expect(p.y - CARTE_MAIN.hauteur / 2).toBeGreaterThanOrEqual(ZONE_MAIN.haut);
          expect(p.y + CARTE_MAIN.hauteur / 2).toBeLessThanOrEqual(ZONE_MAIN.bas);
          expect(pageDeCarte(n, p.index)).toBe(page);
        }
      }
      expect(vus, `${n} cartes`).toEqual(Array.from({ length: n }, (_, i) => i));
    }
    expect(disposerMain(7).pages).toBe(1);
    expect(disposerMain(14).pages).toBe(1);
    expect(disposerMain(15).pages).toBe(2);
    expect(disposerMain(15, 9).page).toBe(1);
  });
});

describe('Huit américain, présentation : textes', () => {
  beforeEach(() => changerLangue('fr'));

  it('raconte le coup qui vient d’être joué, effets compris', () => {
    const avant = situation(['8T 2C VC 4P', '3P 5P', '6K'], '9C');
    const joker = jeu.jouer(avant, 0, { type: 'poser', carte: c('8T'), couleur: 'carreau' });
    const e = evenement(vuePour(avant, 1), vuePour(joker, 1));
    expect(e).toMatchObject({ type: 'pose', joueur: 0, effet: 'joker', couleur: 'carreau' });
    expect(texteEvenement(e, vuePour(joker, 1), 'fr', symboles)).toBe('J1 pose 8♣︎ et demande Carreau');
    expect(texteEvenement(e, vuePour(joker, 1), 'en', symboles)).toBe('J1 plays 8♣︎ and asks for Diamonds');

    const deux = jeu.jouer(avant, 0, { type: 'poser', carte: c('2C') });
    expect(texteEvenement(evenement(vuePour(avant, 0), vuePour(deux, 0)), vuePour(deux, 0), 'fr', symboles)).toBe('J1 pose 2♥︎\nJ2 doit prendre 2 cartes');
    const valet = jeu.jouer(avant, 0, { type: 'poser', carte: c('VC') });
    expect(texteEvenement(evenement(vuePour(avant, 0), vuePour(valet, 0)), vuePour(valet, 0), 'en', symboles)).toBe('J1 plays J♥︎\nJ2 skips a turn');

    const prise = jeu.jouer(deux, 1, { type: 'piocher' });
    expect(evenement(vuePour(deux, 0), vuePour(prise, 0))).toEqual({ type: 'pioche', joueur: 1, nombre: 2, penalite: true });
    expect(evenement(null, vuePour(prise, 0))).toBeNull();
  });

  it('dit à qui de jouer et quoi faire, dans chaque langue', () => {
    const e = situation(['9P 4K', '3P'], '9C');
    expect(texteStatut(vuePour(e, 0), 'fr')).toBe('À toi : pose une carte');
    expect(texteStatut(vuePour(e, 1), 'en')).toBe("J1's turn");
    expect(texteStatut(vuePour({ ...e, mains: [cartes('4K'), cartes('3P')] }, 0), 'fr')).toBe('Aucune carte ne va : touche la pioche');
    expect(texteStatut(vuePour({ ...e, penalite: 4, mains: [cartes('2K'), cartes('3P')] }, 0), 'fr')).toBe('Prends 4 cartes, ou contre avec une carte +2');
    expect(texteStatut(vuePour({ ...e, gagnants: [0] }, 0), 'en')).toBe('You win!');
    expect(texteStatut(vuePour({ ...e, gagnants: [1] }, 0), 'fr')).toBe('J2 a gagné !');
  });

  it('ne laisse jamais de {variable} non remplacée', () => {
    pourChaqueVue((vue) => {
      for (const langue of LANGUES) expect(texteStatut(vue, langue)).not.toMatch(/[{}]/);
    });
  });
});

/** Toutes les cartes présentes dans une valeur JSON. */
function cartesVisibles(valeur: unknown): number {
  if (Array.isArray(valeur)) return valeur.reduce((n: number, v) => n + cartesVisibles(v), 0);
  if (valeur && typeof valeur === 'object') {
    if ('rang' in valeur && 'couleur' in valeur) return 1;
    return Object.values(valeur).reduce((n: number, v) => n + cartesVisibles(v), 0);
  }
  return 0;
}

function memoire() {
  const d = new Map<string, string>();
  return { d, getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v), removeItem: (k: string) => void d.delete(k) };
}

describe('Huit américain sur un seul téléphone (D-A2-07, D-A2-03, D-D-09)', () => {
  beforeEach(() => {
    changerLangue('fr');
    vi.useFakeTimers();
  });
  afterEach(() => {
    quitterPartie();
    vi.useRealTimers();
  });

  function preparer(stockage = memoire()) {
    const conteneur = document.createElement('main');
    document.body.replaceChildren(conteneur);
    const ecran: { donnees?: DonneesEcran<Vue, Coup>; demonte: boolean } = { demonte: false };
    const contexte: ContextePartie = {
      langue: 'fr',
      reglages: { ...reglagesParDefaut('fr'), pseudo: 'Fab' },
      stockage,
      pauseOrdinateurMs: 5,
      monter: async (_zone, _charger, donnees) => {
        ecran.donnees = donnees as DonneesEcran<Vue, Coup>;
        return () => {
          ecran.demonte = true;
        };
      },
    };
    afficherPageJeu(conteneur, creerRegistre([jeu]), 'huit-americain', contexte);
    return { conteneur, stockage, ecran };
  }
  const sauvegarde = (stockage: ReturnType<typeof memoire>) => {
    const texte = stockage.d.get(cleSauvegarde('huit-americain'));
    return texte ? JSON.parse(texte) : null;
  };

  it('propose 1 à 7 ordinateurs et les variantes de règles', () => {
    const { conteneur } = preparer();
    const adversaires = [...conteneur.querySelectorAll<HTMLOptionElement>('#adversaires option')].map((o) => o.value);
    expect(adversaires).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(conteneur.querySelector('#variante-cumul')).not.toBeNull();
    expect(conteneur.querySelector('#variante-cartesParMain')).not.toBeNull();
  });

  it('joue une partie complète contre 7 ordinateurs sans jamais montrer leurs mains à l’écran', async () => {
    const { conteneur, stockage, ecran } = preparer();
    conteneur.querySelector<HTMLSelectElement>('#adversaires')!.value = '7';
    conteneur.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    const donnees = ecran.donnees!;
    expect(donnees.joueur).toBe(0);

    let vuesControlees = 0;
    const controler = (vue: Vue) => {
      const json = copieJson(vue) as unknown as Record<string, unknown>;
      expect(Object.keys(json)).not.toContain('mains');
      expect(Object.keys(json)).not.toContain('hasard');
      expect(typeof json.pioche).toBe('number');
      expect(vue.joueur).toBe(0);
      const s = sauvegarde(stockage);
      if (!s) return; // Partie finie : la sauvegarde est effacée.
      const etat = s.etat as Etat;
      expect(vue.main).toEqual(etat.mains[0]);
      // Seules cartes visibles : sa main, la défausse (et son dessus), la carte qu'il vient de piocher.
      const piochee = vue.piochee ? 1 : 0;
      expect(cartesVisibles(json)).toBe(etat.mains[0]!.length + etat.defausse.length + 1 + piochee);
      vuesControlees++;
    };
    controler(donnees.vue());
    donnees.surNouvelleVue(controler);

    const h = new Hasard(7);
    for (let i = 0; i < 5000 && !conteneur.querySelector('.fin-partie:not([hidden])'); i++) {
      const vue = donnees.vue();
      if (vue.courant === 0 && vue.gagnants === null) donnees.proposerCoup(h.choisir(coupsDeLaVue(vue)));
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(conteneur.querySelector('.fin-partie')!.hasAttribute('hidden')).toBe(false);
    expect(vuesControlees).toBeGreaterThan(10);
    expect(stockage.d.has(cleSauvegarde('huit-americain'))).toBe(false);
  });

  it('reprend une partie fermée au même coup', async () => {
    const stockage = memoire();
    const premiere = preparer(stockage);
    premiere.conteneur.querySelector<HTMLSelectElement>('#adversaires')!.value = '2';
    premiere.conteneur.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(0);
    const avant = premiere.ecran.donnees!;
    // On joue quelques coups, puis on ferme.
    for (let i = 0; i < 20; i++) {
      const vue = avant.vue();
      if (vue.gagnants !== null) break;
      if (vue.courant === 0) avant.proposerCoup(coupsDeLaVue(vue)[0]!);
      await vi.advanceTimersByTimeAsync(10);
    }
    const vueAvant = avant.vue();
    const coups = sauvegarde(stockage)?.coups.length;
    quitterPartie();
    expect(premiere.ecran.demonte).toBe(true);
    if (vueAvant.gagnants !== null) return;

    const seconde = preparer(stockage);
    seconde.conteneur.querySelector<HTMLButtonElement>('[data-action="reprendre"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(seconde.ecran.donnees!.vue()).toEqual(vueAvant);
    expect(sauvegarde(stockage).coups.length).toBe(coups);
  });
});
