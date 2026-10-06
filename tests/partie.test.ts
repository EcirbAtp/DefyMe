import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changerLangue } from '../src/i18n';
import petitsChevaux from '../src/jeux/petits-chevaux';
import type { Vue, Coup } from '../src/jeux/petits-chevaux/regles';
import type { DonneesEcran } from '../src/noyau/contrat';
import { creerRegistre } from '../src/noyau/registre';
import { reglagesParDefaut } from '../src/stockage/reglages';
import { afficherPageJeu, cleSauvegarde, quitterPartie, type ContextePartie } from '../src/ui/partie';

function memoire() {
  const d = new Map<string, string>();
  return { d, getItem: (c: string) => d.get(c) ?? null, setItem: (c: string, v: string) => void d.set(c, v), removeItem: (c: string) => void d.delete(c) };
}

/** Prépare la page avec un faux écran qui garde les données reçues par la scène. */
function preparer(stockage = memoire()) {
  const conteneur = document.createElement('main');
  document.body.replaceChildren(conteneur);
  const ecran: { donnees?: DonneesEcran<Vue, Coup>; demonte: boolean } = { demonte: false };
  const contexte: ContextePartie = {
    langue: 'fr',
    reglages: { ...reglagesParDefaut('fr'), pseudo: 'Fab' },
    stockage,
    pauseOrdinateurMs: 10,
    monter: async (_zone, _charger, donnees) => {
      ecran.donnees = donnees as DonneesEcran<Vue, Coup>;
      return () => {
        ecran.demonte = true;
      };
    },
  };
  const registre = creerRegistre([petitsChevaux]);
  const afficher = () => afficherPageJeu(conteneur, registre, 'petits-chevaux', contexte);
  afficher();
  return { conteneur, stockage, ecran, afficher };
}

const sauvegarde = (stockage: ReturnType<typeof memoire>) => JSON.parse(stockage.d.get(cleSauvegarde('petits-chevaux'))!);

describe('Partie sur un seul téléphone (D-A2-07, D-D-09)', () => {
  beforeEach(() => {
    changerLangue('fr');
    vi.useFakeTimers();
  });
  afterEach(() => {
    quitterPartie();
    vi.useRealTimers();
  });

  it('propose de choisir 1 à 3 ordinateurs, leur niveau et les variantes', () => {
    const { conteneur } = preparer();
    const adversaires = [...conteneur.querySelectorAll<HTMLOptionElement>('#adversaires option')].map((o) => o.value);
    expect(adversaires).toEqual(['1', '2', '3']);
    const niveaux = [...conteneur.querySelectorAll<HTMLOptionElement>('#niveau option')].map((o) => o.textContent);
    expect(niveaux).toEqual(['Facile', 'Moyen', 'Difficile']);
    expect(conteneur.querySelector('#variante-escalier')).not.toBeNull();
  });

  it("lance la partie, laisse jouer l'humain et l'ordinateur, et sauvegarde à chaque coup", async () => {
    const { conteneur, stockage, ecran } = preparer();
    conteneur.querySelector<HTMLSelectElement>('#adversaires')!.value = '1';
    conteneur.querySelector<HTMLSelectElement>('#niveau')!.value = '3';
    conteneur.querySelector<HTMLSelectElement>('#variante-victoire')!.value = '1';
    conteneur.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.runAllTimersAsync();

    const donnees = ecran.donnees!;
    expect(donnees.joueur).toBe(0);
    const s = sauvegarde(stockage);
    expect(s.places.map((p: { controle: { type: string } }) => p.controle.type)).toEqual(['humain', 'ordinateur']);
    expect(s.places[1].controle.niveau).toBe(3);
    expect(s.options.victoire).toBe('premier');
    expect(s.places[0].joueur.pseudo).toBe('Fab');

    // On joue jusqu'à la fin : l'humain prend toujours le premier coup permis.
    const vues: Vue[] = [];
    donnees.surNouvelleVue((v) => vues.push(v));
    for (let i = 0; i < 5000 && !conteneur.querySelector<HTMLElement>('.fin-partie:not([hidden])'); i++) {
      const vue = donnees.vue();
      if (vue.courant === 0 && vue.gagnant === null) {
        const coups = petitsChevaux.coupsPermis({ ...vue, hasard: 0 }, 0);
        donnees.proposerCoup(coups[0]!);
      }
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(vues.length).toBeGreaterThan(10);
    expect(vues.every((v) => !('hasard' in v))).toBe(true);
    expect(conteneur.querySelector('.fin-partie')!.hasAttribute('hidden')).toBe(false);
    // Partie finie : plus rien à reprendre.
    expect(stockage.d.has(cleSauvegarde('petits-chevaux'))).toBe(false);
  });

  it('reprend une partie fermée au même coup', async () => {
    const stockage = memoire();
    const premiere = preparer(stockage);
    premiere.conteneur.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.runAllTimersAsync();
    const avant = premiere.ecran.donnees!;
    if (avant.vue().courant === 0) avant.proposerCoup({ type: 'lancer' });
    const etatSauve = sauvegarde(stockage);
    quitterPartie();
    expect(premiere.ecran.demonte).toBe(true);

    const seconde = preparer(stockage);
    expect(seconde.conteneur.textContent).toContain('Une partie est en cours');
    seconde.conteneur.querySelector<HTMLButtonElement>('[data-action="reprendre"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    const { hasard: _h, ...vueSauvee } = etatSauve.etat;
    expect(seconde.ecran.donnees!.vue()).toEqual(vueSauvee);
  });

  it('peut abandonner la partie sauvegardée pour en commencer une nouvelle', async () => {
    const stockage = memoire();
    const premiere = preparer(stockage);
    premiere.conteneur.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.runAllTimersAsync();
    quitterPartie();
    const seconde = preparer(stockage);
    seconde.conteneur.querySelector<HTMLButtonElement>('[data-action="nouvelle"]')!.click();
    expect(stockage.d.has(cleSauvegarde('petits-chevaux'))).toBe(false);
    expect(seconde.conteneur.querySelector('form')).not.toBeNull();
  });
});
