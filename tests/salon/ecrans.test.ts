import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changerLangue, t } from '../../src/i18n';
import petitsChevaux from '../../src/jeux/petits-chevaux';
import type { Vue } from '../../src/jeux/petits-chevaux/regles';
import { creerRegistre } from '../../src/noyau/registre';
import { SessionDePartie } from '../../src/noyau/session';
import { ErreurReseau, HoteReseau, brancherPartie, entrerDansLeSalon } from '../../src/reseau';
import { catalogue } from '../../src/salon/salon';
import { COULEURS, reglagesParDefaut } from '../../src/stockage/reglages';
import { demarrerAppli } from '../../src/ui/app';
import { quitterPartie } from '../../src/ui/partie';
import { afficherRejoindre, afficherSalonHote, type ContexteSalon } from '../../src/ui/salon';
import { allumettes } from '../exemples/allumettes';
import { attendre, ecranAutomatique, fauxServeur } from './outils';

const registre = creerRegistre([petitsChevaux, allumettes]);
const CATALOGUE = catalogue(registre);

function contexte(serveur: ReturnType<typeof fauxServeur>, ecran = ecranAutomatique(), pseudo = 'Fab'): ContexteSalon {
  return {
    langue: 'fr',
    reglages: { ...reglagesParDefaut('fr'), pseudo },
    stockage: undefined,
    monter: ecran.monter,
    pauseOrdinateurMs: 0,
    registre,
    acces: serveur.acces,
    adresseAppli: 'https://ecirbatp.github.io/DefyMe/#/salon/petits-chevaux',
  };
}

function page(): HTMLElement {
  const conteneur = document.createElement('main');
  document.body.replaceChildren(conteneur);
  return conteneur;
}

const texte = (c: HTMLElement, selecteur: string) => c.querySelector(selecteur)?.textContent ?? '';
const bouton = (c: HTMLElement, action: string) => c.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
const joueurs = (c: HTMLElement) => [...c.querySelectorAll('.joueur-salon__nom')].map((li) => li.textContent);

/** Un invité entré par le réseau, sans écran, qui joue tout seul le premier coup permis. */
async function inviteAutomatique(serveur: ReturnType<typeof fauxServeur>, code: string, pseudo: string, couleur: string = COULEURS[1]) {
  const canal = await serveur.canalVers(code);
  const invite = await entrerDansLeSalon(canal, { joueur: { pseudo, couleur }, jeux: CATALOGUE });
  invite.surVue(({ vue, tour, fin }) => {
    if (fin || tour !== invite.place) return;
    const coups = petitsChevaux.coupsPermis({ ...(vue as Vue), hasard: 0 }, invite.place);
    setTimeout(() => invite.proposerCoup(coups[0]));
  });
  return invite;
}

beforeEach(() => changerLangue('fr'));
afterEach(() => quitterPartie());

describe("salon de l'hôte", () => {
  it('crée le salon en un geste : code, QR code et lien vers l’appli (D-A3-01)', async () => {
    const serveur = fauxServeur();
    const c = page();
    afficherSalonHote(c, 'petits-chevaux', contexte(serveur));
    expect(texte(c, '[role="status"]')).toBe('Création du salon…');
    await attendre(() => c.querySelector('.code-salon') !== null);
    expect(texte(c, '.code-salon')).toBe('K7Q2');
    expect(c.querySelector<HTMLAnchorElement>('.lien-salon')!.href).toBe('https://ecirbatp.github.io/DefyMe/?salon=K7Q2');
    await attendre(() => c.querySelector('.qr-salon svg') !== null);
    const qr = c.querySelector('.qr-salon svg')!;
    expect(qr.getAttribute('aria-label')).toBe('QR code du salon K7Q2');
    expect(qr.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(100);
  });

  it('montre les joueurs en direct, les robots, et ne lance qu’avec assez de joueurs (D-A3-03, D-A3-04)', async () => {
    const serveur = fauxServeur();
    const c = page();
    afficherSalonHote(c, 'petits-chevaux', contexte(serveur));
    await attendre(() => c.querySelector('.code-salon') !== null);
    expect(texte(c, '[data-places]')).toBe('1 sur 4');
    expect(joueurs(c)).toEqual(['Fab (hôte, toi)']);
    expect(bouton(c, 'lancer').disabled).toBe(true);
    expect(c.textContent).toContain('Il manque 1 joueur(s)');

    await inviteAutomatique(serveur, 'K7Q2', 'Ana');
    await attendre(() => texte(c, '[data-places]') === '2 sur 4');
    expect(joueurs(c)).toEqual(['Fab (hôte, toi)', 'Ana']);
    expect(bouton(c, 'lancer').disabled).toBe(false);

    // Deux robots, l'un difficile : le salon est complet.
    c.querySelector<HTMLSelectElement>('#niveau-robot')!.value = '3';
    bouton(c, 'ajouter-robot').click();
    bouton(c, 'ajouter-robot').click();
    expect(joueurs(c)).toEqual(['Fab (hôte, toi)', 'Ana', 'Ordi 1 · Difficile', 'Ordi 2 · Difficile']);
    expect(texte(c, '[data-places]')).toBe('4 sur 4');
    expect(bouton(c, 'ajouter-robot').disabled).toBe(true);

    // Un humain qui arrive prend la place d'un robot.
    await inviteAutomatique(serveur, 'K7Q2', 'Bob');
    await attendre(() => joueurs(c).length === 4 && joueurs(c).includes('Bob'));
    expect(joueurs(c)).toEqual(['Fab (hôte, toi)', 'Ana', 'Bob', 'Ordi 1 · Difficile']);

    // Retirer le robot, puis un 4e humain ; un 5e est refusé (salon plein).
    bouton(c, 'retirer-robot').click();
    expect(texte(c, '[data-places]')).toBe('3 sur 4');
    await inviteAutomatique(serveur, 'K7Q2', 'Cyd');
    await expect(inviteAutomatique(serveur, 'K7Q2', 'Dan')).rejects.toMatchObject({ code: 'salon-plein' });
    await attendre(() => texte(c, '[data-places]') === '4 sur 4');
  });

  it("arbitre une partie de Petits chevaux jusqu'au bout avec un invité et un robot (D-A2-02, D-A2-03)", async () => {
    const serveur = fauxServeur();
    const ecran = ecranAutomatique();
    const c = page();
    afficherSalonHote(c, 'petits-chevaux', contexte(serveur, ecran));
    await attendre(() => c.querySelector('.code-salon') !== null);
    const ana = await inviteAutomatique(serveur, 'K7Q2', 'Ana', COULEURS[0]);
    await attendre(() => !bouton(c, 'lancer').disabled);
    bouton(c, 'ajouter-robot').click();
    c.querySelector<HTMLSelectElement>('#variante-victoire')!.value = '1'; // partie courte
    bouton(c, 'lancer').click();

    // Le code ne mène plus nulle part une fois la partie lancée (D-A3-05).
    expect(serveur.salons.has('K7Q2')).toBe(false);
    await attendre(() => ecran.ecrans.length === 1);
    expect(ecran.ecrans[0]!.joueur).toBe(0);
    await attendre(() => ana.place !== null);
    expect(ana.place).toBe(1);
    const { joueurs: places } = ana.donneesLancement as { joueurs: { pseudo: string; couleur: string; robot: boolean }[] };
    expect(places.map((j) => [j.pseudo, j.robot])).toEqual([
      ['Fab', false],
      ['Ana', false],
      ['Ordi 1', true],
    ]);
    // Ana avait choisi la même couleur que l'hôte : elle en reçoit une autre.
    expect(new Set(places.map((j) => j.couleur)).size).toBe(3);

    await attendre(() => !c.querySelector<HTMLElement>('.fin-partie')!.hidden, 20_000);
    const vueHote = ecran.ecrans[0]!.vue();
    expect(vueHote.gagnant).not.toBeNull();
    expect(vueHote.options.victoire).toBe('premier');
    await attendre(() => ana.vue?.fin != null);
    expect(ana.vue!.vue).toEqual(vueHote);
    expect('hasard' in (ana.vue!.vue as object)).toBe(false);
  });

  it("fait jouer l'ordinateur à la place d'un invité qui part (D-A2-04)", async () => {
    const serveur = fauxServeur();
    const ecran = ecranAutomatique();
    const c = page();
    afficherSalonHote(c, 'petits-chevaux', contexte(serveur, ecran));
    await attendre(() => c.querySelector('.code-salon') !== null);
    const ana = await inviteAutomatique(serveur, 'K7Q2', 'Ana');
    await attendre(() => !bouton(c, 'lancer').disabled);
    c.querySelector<HTMLSelectElement>('#variante-victoire')!.value = '1';
    bouton(c, 'lancer').click();
    await attendre(() => ana.vue !== null);
    ana.quitter();
    await attendre(() => texte(c, '.annonce') !== '');
    expect(texte(c, '.annonce')).toBe("Ana a quitté la partie : l'ordinateur joue à sa place.");
    await attendre(() => !c.querySelector<HTMLElement>('.fin-partie')!.hidden, 20_000);
  });

  it('donne un message clair si le serveur est injoignable ou non configuré (D-A3-09)', async () => {
    const serveur = fauxServeur();
    const c = page();
    serveur.echouerOuverture(new ErreurReseau('config-introuvable'));
    afficherSalonHote(c, 'petits-chevaux', contexte(serveur));
    await attendre(() => c.querySelector('[role="alert"]') !== null);
    expect(texte(c, '[role="alert"]')).toContain('config-reseau.json');

    serveur.echouerOuverture(new ErreurReseau('serveur-injoignable'));
    bouton(c, 'reessayer').click();
    await attendre(() => c.querySelector('[data-erreur="serveur-injoignable"]') !== null);
    expect(texte(c, '[role="alert"]')).toBe(t('salon.erreur.serveur-injoignable'));

    serveur.echouerOuverture(null);
    bouton(c, 'reessayer').click();
    await attendre(() => c.querySelector('.code-salon') !== null);
  });

  it('ferme le salon quand on quitte la page', async () => {
    const serveur = fauxServeur();
    const c = page();
    afficherSalonHote(c, 'petits-chevaux', contexte(serveur));
    await attendre(() => c.querySelector('.code-salon') !== null);
    const ana = await inviteAutomatique(serveur, 'K7Q2', 'Ana');
    let ferme = false;
    ana.surFermeture(() => (ferme = true));
    quitterPartie();
    expect(serveur.salons.size).toBe(0);
    await attendre(() => ferme);
  });
});

describe("entrée d'un invité", () => {
  /** Un hôte réseau sans écran, avec son salon ouvert sur le faux serveur. */
  async function hoteSansEcran(serveur: ReturnType<typeof fauxServeur>, version = petitsChevaux.fiche.version) {
    const salon = await serveur.acces.ouvrir();
    const hote = new HoteReseau({ jeu: { id: 'petits-chevaux', version }, joueur: { pseudo: 'Hôte', couleur: COULEURS[0] }, maxInvites: 3 });
    salon.surCanal((canal) => hote.accueillir(canal));
    return { hote, code: salon.code };
  }

  it('vérifie le code tapé et explique un code inconnu', async () => {
    const serveur = fauxServeur();
    const c = page();
    afficherRejoindre(c, null, contexte(serveur));
    const champ = c.querySelector<HTMLInputElement>('#code-salon')!;
    champ.value = 'AB';
    c.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(texte(c, '[role="alert"]')).toBe('Le code a 4 caractères : des lettres et des chiffres.');
    champ.value = 'zzzz';
    c.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await attendre(() => c.querySelector('[data-erreur]') !== null);
    expect(c.querySelector('[data-erreur]')!.getAttribute('data-erreur')).toBe('salon-introuvable');
    expect(champ.value).toBe('ZZZZ');
    expect(bouton(c, 'entrer').disabled).toBe(false);
  });

  it('refuse clairement une version incompatible (D-A1-08) et une connexion directe ratée (D-A3-12)', async () => {
    const serveur = fauxServeur();
    const { code } = await hoteSansEcran(serveur, 99);
    const c = page();
    afficherRejoindre(c, code, contexte(serveur));
    await attendre(() => c.querySelector('[data-erreur]') !== null);
    expect(c.querySelector('[data-erreur]')!.getAttribute('data-erreur')).toBe('version-differente');
    expect(texte(c, '[role="alert"]')).toContain('même version');

    serveur.echouerEntree(new ErreurReseau('connexion-directe-impossible'));
    c.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await attendre(() => c.querySelector('[data-erreur="connexion-directe-impossible"]') !== null);
    expect(texte(c, '[role="alert"]')).toContain('même Wi-Fi');
  });

  it("entre par le code, voit le salon en direct, joue sa partie et voit la fin de l'hôte (D-A3-02, D-A2-03)", async () => {
    const serveur = fauxServeur();
    const { hote, code } = await hoteSansEcran(serveur);
    const ecran = ecranAutomatique();
    const c = page();
    afficherRejoindre(c, null, contexte(serveur, ecran, 'Ana'));
    c.querySelector<HTMLInputElement>('#code-salon')!.value = code.toLowerCase();
    c.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await attendre(() => joueurs(c).length === 2);
    expect(joueurs(c)).toEqual(['Hôte (hôte)', 'Ana (toi)']);
    expect(texte(c, '[data-places]')).toBe('2 sur 4');
    expect(c.textContent).toContain(`Tu es dans le salon ${code}`);

    const bob = await inviteAutomatique(serveur, code, 'Bob');
    await attendre(() => joueurs(c).length === 3);

    // L'hôte lance : il joue sur son téléphone, sans écran ici.
    const places = hote.participants.map((p) => ({ joueur: p.joueur, controle: { type: 'humain' as const } }));
    const session = SessionDePartie.creer(petitsChevaux, places, { graine: 7, options: { ...petitsChevaux.optionsParDefaut, victoire: 'premier' } });
    session.ecouter(() => {
      if (!session.fin && session.joueurCourant === 0) setTimeout(() => session.proposerCoup(0, session.coupsPermis(0)[0]!));
    });
    brancherPartie(hote, session, {
      places: new Map([[1, 1], [2, 2]]),
      donnees: { joueurs: places.map((p) => ({ ...p.joueur, robot: false })) },
    });
    if (session.joueurCourant === 0) session.proposerCoup(0, { type: 'lancer' });

    await attendre(() => ecran.ecrans.length === 1);
    expect(ecran.ecrans[0]!.joueur).toBe(1);
    await attendre(() => session.fin !== null && !c.querySelector<HTMLElement>('.fin-partie')!.hidden, 20_000);
    const { hasard: _h, ...vueAttendue } = session.etat;
    expect(ecran.ecrans[0]!.vue()).toEqual(vueAttendue);
    expect(bob.vue!.vue).toEqual(vueAttendue);
    const gagnant = session.places[session.fin!.gagnants[0]!]!.joueur.pseudo;
    expect(texte(c, '.fin-partie')).toContain(gagnant === 'Ana' ? 'Bravo' : `${gagnant} a gagné`);
    expect(new Set(session.coups.map((x) => x.joueur))).toEqual(new Set([0, 1, 2]));
  });

  it("prévient quand l'hôte ferme le salon", async () => {
    const serveur = fauxServeur();
    const { hote, code } = await hoteSansEcran(serveur);
    const c = page();
    afficherRejoindre(c, code, contexte(serveur));
    await attendre(() => joueurs(c).length === 2);
    hote.fermer();
    await attendre(() => c.querySelector('[data-erreur="salon-ferme"]') !== null);
  });

  it('quitter la page fait quitter le salon', async () => {
    const serveur = fauxServeur();
    const { hote, code } = await hoteSansEcran(serveur);
    const c = page();
    afficherRejoindre(c, code, contexte(serveur));
    await attendre(() => hote.participants.length === 2);
    quitterPartie();
    await attendre(() => hote.participants.length === 1);
  });
});

describe('lien du QR code (D-A3-02)', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it("ouvre l'appli directement sur l'entrée du salon", async () => {
    const serveur = fauxServeur();
    const demandes: string[] = [];
    const acces = { ...serveur.acces, rejoindre: (code: string) => (demandes.push(code), serveur.acces.rejoindre(code)) };
    history.replaceState(null, '', '/DefyMe/?salon=k7q2');
    const racine = document.createElement('div');
    document.body.replaceChildren(racine);
    demarrerAppli(racine, { registre, stockage: undefined, langueDuTelephone: 'fr', version: '0', acces });
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/rejoindre/K7Q2');
    expect(racine.querySelector('h1')?.textContent).toBe('Rejoindre un salon');
    await attendre(() => demandes.length === 1);
    expect(demandes).toEqual(['K7Q2']);
  });

  it('propose de créer ou rejoindre un salon depuis la page du jeu et le menu', () => {
    history.replaceState(null, '', '/DefyMe/#/jeu/petits-chevaux');
    const racine = document.createElement('div');
    document.body.replaceChildren(racine);
    const appli = demarrerAppli(racine, { registre, stockage: undefined, langueDuTelephone: 'fr', version: '0', acces: fauxServeur().acces });
    expect(racine.querySelector<HTMLAnchorElement>('[data-action="creer-salon"]')!.getAttribute('href')).toBe('#/salon/petits-chevaux');
    location.hash = '#/jeux';
    appli.afficher();
    expect(racine.querySelector<HTMLAnchorElement>('[data-action="rejoindre-salon"]')!.getAttribute('href')).toBe('#/rejoindre');
  });
});

