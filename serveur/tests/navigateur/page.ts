/**
 * Page de test chargée dans des navigateurs invisibles : chaque onglet joue
 * le rôle d'un téléphone, hôte ou invité. Elle utilise le vrai code réseau
 * de l'appli (src/reseau) et le faux jeu de test.
 */
import { SessionDePartie, type Place } from '../../../src/noyau/session';
import {
  ErreurReseau,
  HoteReseau,
  brancherPartie,
  entrerDansLeSalon,
  ouvrirSalon,
  rejoindreSalon,
  type ConfigReseau,
  type InviteReseau,
} from '../../../src/reseau';
import { fauxJeu, type Vue } from '../../../tests/reseau/faux-jeu';

const config = (adresse: string): ConfigReseau => ({ signalisation: adresse, stun: [] });
const moi = (pseudo: string) => ({ pseudo, couleur: '#1e88e5' });
const JEUX = { [fauxJeu.fiche.id]: fauxJeu.fiche.version };

let hote: HoteReseau | null = null;
let session: SessionDePartie<unknown, unknown, unknown, unknown> | null = null;
let invite: InviteReseau | null = null;
let fermerSalon: () => void = () => {};

const essai = {
  async ouvrir(adresse: string): Promise<string> {
    const salon = await ouvrirSalon(config(adresse));
    hote = new HoteReseau({ jeu: fauxJeu.fiche, joueur: moi('Hôte') });
    salon.surCanal((canal) => hote!.accueillir(canal));
    fermerSalon = () => salon.fermer();
    return salon.code;
  },

  participants(): string[] {
    return (hote?.participants ?? invite?.participants ?? []).map((p) => p.joueur.pseudo);
  },

  /** L'hôte lance la partie avec les invités présents, plus des robots. */
  lancer(robots: number): void {
    const h = hote!;
    const invites = h.participants.slice(1);
    const places: Place[] = [
      ...h.participants.map((p) => ({ joueur: p.joueur, controle: { type: 'humain' as const } })),
      ...Array.from({ length: robots }, (_, i) => ({ joueur: moi(`Robot ${i + 1}`), controle: { type: 'ordinateur' as const, niveau: 1 as const } })),
    ];
    fermerSalon();
    const s = SessionDePartie.creer(fauxJeu, places, { graine: 2026, options: { cible: 40 } });
    session = s as typeof session;
    const jouerSiMonTour = () => {
      if (!s.fin && s.joueurCourant === 0) setTimeout(() => s.proposerCoup(0, { avancer: 1 }), 5);
    };
    s.ecouter(jouerSiMonTour);
    brancherPartie(h, s, { places: new Map(invites.map((p, i) => [p.id, i + 1])), delaiOrdinateurMs: 5 });
    jouerSiMonTour();
  },

  etatHote() {
    const s = session;
    return s && { fin: s.fin, compteur: (s.etat as { compteur: number }).compteur, auteurs: [...new Set(s.coups.map((c) => c.joueur))].sort() };
  },

  /** Rejoint le salon et joue tout seul dès que c'est son tour. */
  async rejoindre(adresse: string, code: string, pseudo: string): Promise<number> {
    const canal = await rejoindreSalon(config(adresse), code);
    const i = await entrerDansLeSalon(canal, { joueur: moi(pseudo), jeux: JEUX });
    invite = i;
    i.surVue(({ tour, fin }) => {
      if (!fin && tour === i.place) i.proposerCoup({ avancer: 1 });
    });
    return i.id;
  },

  /** Comme `rejoindre`, mais renvoie le code d'erreur attendu. */
  async echecRejoindre(adresse: string, code: string): Promise<string> {
    try {
      const canal = await rejoindreSalon(config(adresse), code);
      await entrerDansLeSalon(canal, { joueur: moi('X'), jeux: JEUX });
      return 'aucune erreur';
    } catch (e) {
      return e instanceof ErreurReseau ? e.code : String(e);
    }
  },

  etatInvite() {
    const i = invite;
    return i && { place: i.place, vue: i.vue as { vue: Vue; tour: number; fin: unknown } | null };
  },

  delai(): Promise<number> {
    return invite!.mesurerDelai();
  },
};

Object.assign(window, { essai });
export type Essai = typeof essai;
