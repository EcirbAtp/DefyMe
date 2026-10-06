import Phaser from 'phaser';
import { t } from '../../i18n';
import { ECRAN, type DonneesEcran } from '../../noyau/contrat';
import { lireReglages, stockageDuNavigateur } from '../../stockage/reglages';
import type { Carte, Couleur } from './cartes';
import {
  CARTE_MAIN,
  CHOIX_COULEURS,
  TACTILE_MIN,
  actionCarte,
  cartesSpeciales,
  coupAvecCouleur,
  disposerMain,
  evenement,
  mainAffichee,
  nomCouleur,
  nomJoueur,
  ordreAdversaires,
  pageDeCarte,
  passeForcee,
  peutPasser,
  peutPiocher,
  rangAffiche,
  texteEvenement,
  texteStatut,
  type Evenement,
} from './presentation';
import { effetDe, type Coup, type Vue } from './regles';
import { THEME_PAR_DEFAUT, couleurNumerique, type Son, type ThemeHuitAmericain } from './theme';

/**
 * Écran du Huit américain (scène Phaser), pensé pour le portrait et une
 * main (D-C-04) : les adversaires en haut avec leur nombre de cartes, la
 * pioche et la défausse au centre, la main du joueur en bas, à portée de
 * pouce. Toutes les zones à toucher font au moins 81 px de la scène (TACTILE_MIN),
 * soit 44 px sur un téléphone de 360 px de large.
 *
 * L'écran ne connaît que la vue du joueur : jamais les mains adverses
 * (D-A2-03). Il ne fait que proposer des coups, que la session valide
 * (D-A2-02). Couleurs, symboles et sons viennent du pack de thème (D-A1-09),
 * les textes de src/i18n (D-D-05).
 */

const LARGEUR = ECRAN.largeur;
const HAUTEUR = ECRAN.hauteur;

/** Bandeau des adversaires. */
const ADVERSAIRES = { haut: 6, bas: 180, marge: 8, ecart: 8 } as const;
/** Tapis central : pioche, défausse, couleur demandée, sens du jeu. */
const TAPIS = { haut: 188, bas: 388 } as const;
const CARTE_TABLE = { largeur: 100, hauteur: 140 } as const;
const Y_TABLE = 278;
const X_PIOCHE = 222;
const X_DEFAUSSE = 362;
const X_GAUCHE = 80;
const X_DROITE = 515;
/** Statut et dernier coup, entre la table et la main. */
const Y_STATUT = 414;
const Y_EVENEMENT = 434;
const FLECHE = 84;

type Objet = Phaser.GameObjects.GameObject & { destroy(): void };

export class EcranHuitAmericain extends Phaser.Scene {
  #donnees!: DonneesEcran<Vue, Coup>;
  #theme: ThemeHuitAmericain = THEME_PAR_DEFAUT;
  #vue: Vue | null = null;
  #page = 0;
  #texteEvenement = '';
  /** Objets redessinés à chaque nouvelle vue. */
  #ephemeres: Objet[] = [];
  #superpose: Phaser.GameObjects.Container | null = null;
  #statut!: Phaser.GameObjects.Text;
  #evenement!: Phaser.GameObjects.Text;
  #pioche!: Phaser.GameObjects.Container;
  #anneauPioche!: Phaser.GameObjects.Graphics;
  #textePioche!: Phaser.GameObjects.Text;
  #couleur!: Phaser.GameObjects.Text;
  #sens!: Phaser.GameObjects.Text;
  #passer!: Phaser.GameObjects.Container;
  #fleches: Phaser.GameObjects.Container[] = [];
  #positionsAdversaires = new Map<number, { x: number; y: number }>();
  #dernierePositionJouee: { x: number; y: number } | null = null;
  #passeEnAttente: Phaser.Time.TimerEvent | null = null;
  #enAttente = false;
  #son = true;
  #desabonner: (() => void) | null = null;

  constructor() {
    super('huit-americain');
  }

  init(donnees: DonneesEcran<Vue, Coup> & { theme?: ThemeHuitAmericain; son?: boolean }): void {
    this.#donnees = donnees;
    if (donnees.theme) this.#theme = donnees.theme;
    // Le son suit le réglage du joueur (Paramètres), lu sur ce téléphone.
    this.#son = donnees.son ?? lireReglages(stockageDuNavigateur(), donnees.langue).son;
  }

  create(): void {
    const vue = this.#donnees.vue();
    this.cameras.main.setBackgroundColor(this.#theme.fond);
    this.#creerTable();
    this.#desabonner = this.#donnees.surNouvelleVue((v) => this.#afficher(v, true));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.#desabonner?.());
    this.#afficher(vue, false);
  }

  get #langue() {
    return this.#donnees.langue;
  }

  #style(taille: number, couleur = this.#theme.texte, gras = false): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: this.#theme.police, fontSize: `${taille}px`, color: couleur, fontStyle: gras ? 'bold' : 'normal' };
  }

  // ——— Éléments fixes ———

  #creerTable(): void {
    const th = this.#theme;
    const g = this.add.graphics();
    g.fillStyle(th.tapis).fillRoundedRect(8, TAPIS.haut, LARGEUR - 16, TAPIS.bas - TAPIS.haut, 22);

    // Pioche : on la touche pour piocher.
    this.#anneauPioche = this.add.graphics();
    const dos = this.#dessinerCarte(null, CARTE_TABLE.largeur, CARTE_TABLE.hauteur);
    this.#pioche = this.add.container(X_PIOCHE, Y_TABLE, [this.#anneauPioche, dos]);
    this.#pioche.setSize(CARTE_TABLE.largeur + 24, CARTE_TABLE.hauteur + 20).setInteractive({ useHandCursor: true });
    this.#pioche.on('pointerup', () => this.#piocher());
    this.#textePioche = this.add.text(X_PIOCHE, TAPIS.bas - 18, '', this.#style(16, th.texteSurCouleur)).setOrigin(0.5);

    // Sens du jeu, à gauche ; bouton d'aide sur les cartes spéciales dessous.
    this.#sens = this.add.text(X_GAUCHE, 232, '', this.#style(44, th.texteSurCouleur, true)).setOrigin(0.5);
    this.add.text(X_GAUCHE, 268, t('huit.sens', {}, this.#langue), this.#style(15, th.texteSurCouleur)).setOrigin(0.5);
    this.#bouton(X_GAUCHE, 330, TACTILE_MIN, TACTILE_MIN, '?', () => this.#montrerAide(), 34);

    // Couleur demandée, à droite, et le bouton Passer dessous.
    this.add.circle(X_DROITE, 228, 38, th.carteFond).setStrokeStyle(3, th.carteBordure);
    this.#couleur = this.add.text(X_DROITE, 230, '', this.#style(46, th.encreNoire, true)).setOrigin(0.5);
    this.add.text(X_DROITE, 280, t('huit.couleurDemandee', {}, this.#langue), this.#style(15, th.texteSurCouleur)).setOrigin(0.5);
    this.#passer = this.#bouton(X_DROITE, 336, 150, TACTILE_MIN, t('huit.passer', {}, this.#langue), () => this.#jouerCoup({ type: 'passer' }), 24);
    this.#passer.setVisible(false);

    this.#statut = this.add.text(LARGEUR / 2, Y_STATUT, '', { ...this.#style(23, th.texte, true), align: 'center', wordWrap: { width: LARGEUR - 2 * FLECHE - 24 } }).setOrigin(0.5);
    this.#evenement = this.add
      .text(LARGEUR / 2, Y_EVENEMENT, '', { ...this.#style(18, th.texteDiscret), align: 'center', wordWrap: { width: LARGEUR - 2 * FLECHE - 8 } })
      .setOrigin(0.5, 0);

    // Flèches pour feuilleter une main trop grande pour l'écran.
    this.#fleches = [-1, 1].map((sens) => {
      const fleche = this.#bouton(sens < 0 ? FLECHE / 2 + 4 : LARGEUR - FLECHE / 2 - 4, Y_STATUT + 16, FLECHE, FLECHE, sens < 0 ? '‹' : '›', () => this.#feuilleter(sens), 44);
      return fleche.setVisible(false);
    });
  }

  /** Bouton rectangulaire arrondi, de la taille d'une zone tactile au moins. */
  #bouton(x: number, y: number, largeur: number, hauteur: number, texte: string, action: () => void, taille = 22): Phaser.GameObjects.Container {
    const th = this.#theme;
    const fond = this.add.graphics();
    fond.fillStyle(th.bouton).fillRoundedRect(-largeur / 2, -hauteur / 2, largeur, hauteur, 16);
    const libelle = this.add.text(0, 0, texte, this.#style(taille, th.boutonTexte, true)).setOrigin(0.5);
    const bouton = this.add.container(x, y, [fond, libelle]);
    bouton.setSize(Math.max(largeur, TACTILE_MIN), Math.max(hauteur, TACTILE_MIN)).setInteractive({ useHandCursor: true });
    bouton.on('pointerup', action);
    return bouton;
  }

  // ——— Cartes ———

  /** Une carte face visible, ou son dos si `carte` est nulle, centrée sur (0, 0). */
  #dessinerCarte(carte: Carte | null, largeur: number, hauteur: number): Phaser.GameObjects.Container {
    const th = this.#theme;
    const g = this.add.graphics();
    const x0 = -largeur / 2;
    const y0 = -hauteur / 2;
    const rayon = th.carteRayon * (largeur / CARTE_MAIN.largeur);
    if (!carte) {
      g.fillStyle(th.dosFond).fillRoundedRect(x0, y0, largeur, hauteur, rayon);
      // Motif générique : une grille de petits losanges dans un cadre.
      const marge = largeur * 0.12;
      const colonnes = 4;
      const pasX = (largeur - 2 * marge) / colonnes;
      const lignes = Math.max(1, Math.round((hauteur - 2 * marge) / pasX));
      const pasY = (hauteur - 2 * marge) / lignes;
      g.fillStyle(th.dosMotif);
      for (let c = 0; c < colonnes; c++) {
        for (let l = 0; l < lignes; l++) {
          const cx = x0 + marge + (c + 0.5) * pasX;
          const cy = y0 + marge + (l + 0.5) * pasY;
          const r = pasX * 0.38;
          g.fillTriangle(cx - r, cy, cx, cy - r, cx + r, cy).fillTriangle(cx - r, cy, cx, cy + r, cx + r, cy);
        }
      }
      g.lineStyle(Math.max(1.5, largeur / 25), th.dosBordure, 0.9).strokeRoundedRect(x0 + marge / 2, y0 + marge / 2, largeur - marge, hauteur - marge, rayon * 0.7);
      return this.add.container(0, 0, [g]);
    }

    g.fillStyle(th.carteFond).fillRoundedRect(x0, y0, largeur, hauteur, rayon);
    g.lineStyle(2, th.carteBordure).strokeRoundedRect(x0, y0, largeur, hauteur, rayon);
    const encre = th.couleursRouges.includes(carte.couleur) ? th.encreRouge : th.encreNoire;
    const symbole = th.symboles[carte.couleur];
    const rang = this.add.text(x0 + largeur * 0.08, y0 + hauteur * 0.04, rangAffiche(carte.rang, this.#langue), this.#style(Math.round(hauteur * 0.22), encre, true));
    const petit = this.add.text(x0 + largeur * 0.1, y0 + hauteur * 0.27, symbole, this.#style(Math.round(hauteur * 0.17), encre));
    const grand = this.add.text(largeur * 0.1, hauteur * 0.12, symbole, this.#style(Math.round(hauteur * 0.42), encre)).setOrigin(0.5);
    const objets: Phaser.GameObjects.GameObject[] = [g, rang, petit, grand];
    const effet = effetDe(this.#vue?.options ?? this.#donnees.vue().options, carte);
    if (effet !== 'aucun') {
      const r = hauteur * 0.13;
      const cx = x0 + largeur - r - 4;
      const cy = y0 + r + 4;
      const pastille = this.add.circle(cx, cy, r, th.pastilleEffet);
      const signe = this.add.text(cx, cy, th.symbolesEffets[effet], this.#style(Math.round(r * 1.05), th.encreNoire, true)).setOrigin(0.5);
      objets.push(pastille, signe);
    }
    return this.add.container(0, 0, objets);
  }

  // ——— Mise à jour ———

  #afficher(vue: Vue, animer: boolean): void {
    const avant = this.#vue;
    this.#vue = vue;
    this.#enAttente = false;
    this.#passeEnAttente?.remove();
    this.#passeEnAttente = null;
    this.#fermerSuperpose();

    const moi = this.#donnees.joueur;
    const e = animer ? evenement(avant, vue) : null;
    if (e) this.#texteEvenement = texteEvenement(e, vue, this.#langue, this.#theme.symboles);
    const aMoi = vue.gagnants === null && vue.courant === moi;
    // Grosse main : on montre la page de la carte piochée, ou d'une carte jouable quand le tour arrive.
    const main = mainAffichee(vue);
    const aMontrer = vue.piochee ? main.find((c) => c.piochee) : aMoi && avant?.courant !== moi ? main.find((c) => c.jouable) : undefined;
    if (aMontrer) this.#page = pageDeCarte(main.length, aMontrer.index);

    for (const objet of this.#ephemeres) {
      this.tweens.killTweensOf(objet);
      objet.destroy();
    }
    this.#ephemeres = [];
    this.tweens.killTweensOf(this.#anneauPioche);

    this.#dessinerAdversaires(vue);
    const dessus = this.#dessinerDefausse(vue);
    this.#dessinerMain(vue);

    const piocher = aMoi && peutPiocher(vue);
    this.#anneauPioche.clear();
    if (piocher) {
      this.#anneauPioche.lineStyle(6, this.#theme.surbrillance).strokeRoundedRect(-CARTE_TABLE.largeur / 2 - 7, -CARTE_TABLE.hauteur / 2 - 7, CARTE_TABLE.largeur + 14, CARTE_TABLE.hauteur + 14, 14);
      this.#anneauPioche.setAlpha(1);
      this.tweens.add({ targets: this.#anneauPioche, alpha: 0.25, duration: 520, yoyo: true, repeat: -1 });
    }
    this.#textePioche.setText(t('huit.pioche', { n: vue.pioche }, this.#langue));
    this.#couleur.setText(this.#theme.symboles[vue.couleur]).setColor(this.#theme.couleursRouges.includes(vue.couleur) ? this.#theme.encreRouge : this.#theme.encreNoire);
    this.#sens.setText(vue.sens === 1 ? '↻' : '↺');
    this.#passer.setVisible(aMoi && peutPasser(vue) && !passeForcee(vue));
    this.#statut.setText(texteStatut(vue, this.#langue));
    this.#evenement.setText(this.#texteEvenement);

    if (e) this.#animer(e, dessus);
    if (e?.type === 'pose') this.#jouerSon('poser');
    else if (e?.type === 'pioche') this.#jouerSon('piocher');
    if (vue.gagnants !== null && avant?.gagnants === null) this.#jouerSon(vue.gagnants.includes(moi) ? 'gagne' : 'perdu');
    else if (aMoi && animer && avant?.courant !== moi) this.#jouerSon('aToi');

    // Rien d'autre à faire que passer : on passe tout seul, après un temps pour lire.
    if (aMoi && passeForcee(vue)) {
      this.#passeEnAttente = this.time.delayedCall(1300, () => this.#jouerCoup({ type: 'passer' }));
    }
  }

  #garder<T extends Objet>(objet: T): T {
    this.#ephemeres.push(objet);
    return objet;
  }

  #dessinerAdversaires(vue: Vue): void {
    const adversaires = ordreAdversaires(vue);
    const k = adversaires.length;
    const rangees = k <= 4 ? 1 : 2;
    const parRangee = Math.ceil(k / rangees);
    const hauteurTotale = ADVERSAIRES.bas - ADVERSAIRES.haut;
    const hauteur = rangees === 1 ? 120 : (hauteurTotale - ADVERSAIRES.ecart) / 2;
    const largeur = Math.min(200, (LARGEUR - 2 * ADVERSAIRES.marge - (parRangee - 1) * ADVERSAIRES.ecart) / parRangee);
    this.#positionsAdversaires.clear();

    adversaires.forEach((joueur, i) => {
      const rangee = i < parRangee ? 0 : 1;
      const dansRangee = rangee === 0 ? parRangee : k - parRangee;
      const position = rangee === 0 ? i : i - parRangee;
      const largeurRangee = dansRangee * largeur + (dansRangee - 1) * ADVERSAIRES.ecart;
      const x = (LARGEUR - largeurRangee) / 2 + position * (largeur + ADVERSAIRES.ecart);
      const y = rangees === 1 ? ADVERSAIRES.haut + (hauteurTotale - hauteur) / 2 : ADVERSAIRES.haut + rangee * (hauteur + ADVERSAIRES.ecart);
      this.#positionsAdversaires.set(joueur, { x: x + largeur / 2, y: y + hauteur / 2 });
      this.#badge(vue, joueur, x, y, largeur, hauteur);
    });
  }

  /** Badge d'un adversaire : couleur, pseudo et nombre de cartes, jamais les cartes. */
  #badge(vue: Vue, joueur: number, x: number, y: number, largeur: number, hauteur: number): void {
    const th = this.#theme;
    const courant = vue.gagnants === null && vue.courant === joueur;
    const gagnant = vue.gagnants?.includes(joueur) ?? false;
    const nombre = vue.nombreCartes[joueur] ?? 0;
    const couleur = couleurNumerique(vue.joueurs[joueur]?.couleur ?? '#777777');

    const g = this.#garder(this.add.graphics());
    g.fillStyle(th.panneau).fillRoundedRect(x, y, largeur, hauteur, 14);
    g.lineStyle(courant || gagnant ? 5 : 2, courant || gagnant ? th.surbrillance : th.panneauBordure).strokeRoundedRect(x, y, largeur, hauteur, 14);
    g.fillStyle(couleur).fillRoundedRect(x, y, 10, hauteur, { tl: 14, bl: 14, tr: 0, br: 0 });
    if (courant) this.tweens.add({ targets: g, alpha: 0.6, duration: 520, yoyo: true, repeat: -1 });

    const grand = hauteur > 100;
    const nom = (gagnant ? '★ ' : '') + nomJoueur(vue, joueur);
    const texteNom = this.#garder(this.add.text(x + 18, y + (grand ? 14 : 8), nom, this.#style(grand ? 20 : 17, th.texte, true)));
    texteNom.setCrop(0, 0, largeur - 24, 40);

    // Petit éventail de dos de cartes, puis le nombre.
    const dosL = grand ? 26 : 20;
    const dosH = grand ? 36 : 28;
    const visibles = Math.min(nombre, largeur < 170 ? 3 : 6);
    const yDos = y + hauteur - dosH / 2 - (grand ? 16 : 8);
    for (let d = 0; d < visibles; d++) {
      const dos = this.#garder(this.#dessinerCarte(null, dosL, dosH));
      dos.setPosition(x + 18 + dosL / 2 + d * (dosL * 0.35), yDos);
    }
    const xTexte = visibles === 0 ? x + 18 : x + 22 + dosL + (visibles - 1) * dosL * 0.35;
    const texte = nombre === 1 ? t('huit.uneCarte', {}, this.#langue) : t('huit.nbCartes', { n: nombre }, this.#langue);
    const texteNombre = this.#garder(this.add.text(xTexte, yDos, texte, this.#style(grand ? 18 : 15, nombre === 1 ? th.encreRouge : th.texteDiscret, nombre <= 2)).setOrigin(0, 0.5));
    texteNombre.setCrop(0, 0, Math.max(0, x + largeur - xTexte - 4), 40);
  }

  #dessinerDefausse(vue: Vue): Phaser.GameObjects.Container {
    const th = this.#theme;
    // Deux cartes de dessous, un peu de travers, pour donner du volume.
    const n = vue.defausse.length;
    for (let k = Math.max(0, n - 3); k < n - 1; k++) {
      const c = this.#garder(this.#dessinerCarte(vue.defausse[k] as Carte, CARTE_TABLE.largeur, CARTE_TABLE.hauteur));
      c.setPosition(X_DEFAUSSE, Y_TABLE).setAngle((k % 2 === 0 ? -1 : 1) * 6);
    }
    const dessus = this.#garder(this.#dessinerCarte(vue.dessus, CARTE_TABLE.largeur, CARTE_TABLE.hauteur));
    dessus.setPosition(X_DEFAUSSE, Y_TABLE);
    if (vue.penalite > 0) {
      const x = X_DEFAUSSE + CARTE_TABLE.largeur / 2;
      const y = Y_TABLE - CARTE_TABLE.hauteur / 2;
      this.#garder(this.add.circle(x, y, 26, th.alerte).setStrokeStyle(3, th.carteFond));
      this.#garder(this.add.text(x, y, `+${vue.penalite}`, this.#style(22, th.texteSurCouleur, true)).setOrigin(0.5));
    }
    return dessus;
  }

  #dessinerMain(vue: Vue): void {
    const th = this.#theme;
    const moi = this.#donnees.joueur;
    const aMoi = vue.gagnants === null && vue.courant === moi;
    const cartes = mainAffichee(vue);
    const disposition = disposerMain(cartes.length, this.#page);
    this.#page = disposition.page;

    disposition.places.forEach((place, rang) => {
      const c = cartes[place.index]!;
      const carte = this.#garder(this.#dessinerCarte(c.carte, CARTE_MAIN.largeur, CARTE_MAIN.hauteur));
      const leve = c.jouable || c.piochee;
      carte.setPosition(place.x, place.y - (leve && aMoi ? 8 : 0)).setDepth(10 + rang);
      if (aMoi && c.jouable) {
        const anneau = this.add.graphics();
        anneau.lineStyle(5, th.surbrillance).strokeRoundedRect(-CARTE_MAIN.largeur / 2 - 2, -CARTE_MAIN.hauteur / 2 - 2, CARTE_MAIN.largeur + 4, CARTE_MAIN.hauteur + 4, th.carteRayon + 2);
        carte.add(anneau);
      } else if (aMoi) {
        carte.setAlpha(th.opaciteInjouable);
      }
      if (c.piochee) {
        const marque = this.add.circle(0, CARTE_MAIN.hauteur / 2 - 12, 7, th.surbrillance).setStrokeStyle(2, th.carteBordure);
        carte.add(marque);
      }
      carte.setSize(CARTE_MAIN.largeur, CARTE_MAIN.hauteur).setInteractive({ useHandCursor: c.jouable });
      carte.setName(`carte-${place.index}`);
      carte.on('pointerup', () => this.#toucherCarte(place.index, place.x, place.y));
    });

    // Flèches pour feuilleter, dorées si une carte jouable attend sur une autre page.
    const plusieurs = disposition.pages > 1;
    const jouableVers = (sens: number) =>
      aMoi && cartes.some((c) => c.jouable && Math.sign(pageDeCarte(cartes.length, c.index) - disposition.page) === sens);
    this.#fleches.forEach((fleche, i) => {
      const sens = i === 0 ? -1 : 1;
      const possible = sens < 0 ? disposition.page > 0 : disposition.page < disposition.pages - 1;
      const fond = fleche.list[0] as Phaser.GameObjects.Graphics;
      fond.clear().fillStyle(jouableVers(sens) ? th.surbrillance : th.bouton).fillRoundedRect(-FLECHE / 2, -FLECHE / 2, FLECHE, FLECHE, 16);
      fleche.setVisible(plusieurs).setAlpha(possible ? 1 : 0.35);
    });
  }

  /** Les cartes bougent : la carte posée arrive sur la défausse, les cartes piochées partent de la pioche. */
  #animer(e: Evenement, dessus: Phaser.GameObjects.Container): void {
    const duree = this.#theme.dureeAnimation;
    const moi = this.#donnees.joueur;
    const depuis = (joueur: number) =>
      joueur === moi ? (this.#dernierePositionJouee ?? { x: LARGEUR / 2, y: HAUTEUR - 120 }) : (this.#positionsAdversaires.get(joueur) ?? { x: LARGEUR / 2, y: 0 });

    if (e.type === 'pose') {
      const { x, y } = depuis(e.joueur);
      dessus.setPosition(x, y).setScale(0.7).setDepth(60);
      this.tweens.add({ targets: dessus, x: X_DEFAUSSE, y: Y_TABLE, scale: 1, duration: duree, ease: 'Quad.easeOut' });
    } else if (e.type === 'pioche') {
      const vers = e.joueur === moi ? { x: LARGEUR / 2, y: HAUTEUR - 140 } : depuis(e.joueur);
      for (let k = 0; k < Math.min(e.nombre, 4); k++) {
        const dos = this.#garder(this.#dessinerCarte(null, CARTE_TABLE.largeur, CARTE_TABLE.hauteur));
        dos.setPosition(X_PIOCHE, Y_TABLE).setDepth(50);
        this.tweens.add({ targets: dos, x: vers.x, y: vers.y, scale: 0.4, alpha: 0, delay: k * 90, duration: duree, ease: 'Quad.easeIn' });
      }
    }
    this.#dernierePositionJouee = null;
  }

  // ——— Actions du joueur ———

  /** Propose un coup à la session, une seule fois, au calme (hors du traitement du toucher). */
  #jouerCoup(coup: Coup): void {
    const vue = this.#vue;
    if (!vue || this.#enAttente || vue.gagnants !== null || vue.courant !== this.#donnees.joueur) return;
    this.#enAttente = true;
    this.#passeEnAttente?.remove();
    this.#passeEnAttente = null;
    this.time.delayedCall(0, () => this.#donnees.proposerCoup(coup));
    // Coup refusé ou réseau lent : on redonne la main après un moment.
    this.time.delayedCall(1500, () => {
      if (this.#vue === vue) this.#enAttente = false;
    });
  }

  #toucherCarte(index: number, x: number, y: number): void {
    const vue = this.#vue;
    if (!vue) return;
    const carte = mainAffichee(vue)[index];
    if (!carte) return;
    const action = actionCarte(carte);
    this.#dernierePositionJouee = { x, y };
    if (action.type === 'coup') this.#jouerCoup(action.coup);
    else if (action.type === 'couleur') this.#choisirCouleur(action.coups);
  }

  #piocher(): void {
    const vue = this.#vue;
    if (vue && vue.courant === this.#donnees.joueur && peutPiocher(vue)) this.#jouerCoup({ type: 'piocher' });
  }

  #feuilleter(sens: number): void {
    const vue = this.#vue;
    if (!vue) return;
    const { pages } = disposerMain(vue.main.length, this.#page);
    const page = Math.min(Math.max(0, this.#page + sens), pages - 1);
    if (page === this.#page) return;
    this.#page = page;
    const estCarte = (o: Objet) => o.name.startsWith('carte-');
    for (const objet of this.#ephemeres.filter(estCarte)) objet.destroy();
    this.#ephemeres = this.#ephemeres.filter((o) => !estCarte(o));
    this.#dessinerMain(vue);
  }

  // ——— Fenêtres par-dessus l'écran ———

  #ouvrirSuperpose(hauteur: number, titre: string): { panneau: Phaser.GameObjects.Container; haut: number } {
    this.#fermerSuperpose();
    const th = this.#theme;
    const voile = this.add.rectangle(LARGEUR / 2, HAUTEUR / 2, LARGEUR, HAUTEUR, th.voile, 0.55).setInteractive();
    voile.on('pointerup', () => this.#fermerSuperpose());
    const haut = (HAUTEUR - hauteur) / 2;
    const fond = this.add.graphics();
    fond.fillStyle(th.panneau).fillRoundedRect(24, haut, LARGEUR - 48, hauteur, 20);
    // Le panneau arrête les touchers : seul le voile autour ferme la fenêtre.
    const bloc = this.add.rectangle(LARGEUR / 2, haut + hauteur / 2, LARGEUR - 48, hauteur).setInteractive();
    const texteTitre = this.add.text(LARGEUR / 2, haut + 36, titre, this.#style(24, th.texte, true)).setOrigin(0.5);
    const panneau = this.add.container(0, 0, [voile, fond, bloc, texteTitre]).setDepth(100);
    this.#superpose = panneau;
    return { panneau, haut };
  }

  /**
   * Ferme la fenêtre. Elle est cachée tout de suite mais détruite à l'image
   * suivante : on ne détruit pas un bouton pendant qu'il traite son toucher.
   */
  #fermerSuperpose(): void {
    const superpose = this.#superpose;
    if (!superpose) return;
    this.#superpose = null;
    superpose.setVisible(false);
    superpose.each((o: Phaser.GameObjects.GameObject) => o.disableInteractive());
    this.time.delayedCall(0, () => superpose.destroy());
  }

  /** Après un joker : la couleur demandée, en quatre gros boutons. */
  #choisirCouleur(coups: Coup[]): void {
    const vue = this.#vue;
    if (!vue) return;
    const th = this.#theme;
    const { panneau, haut } = this.#ouvrirSuperpose(470, t('huit.choisirCouleur', {}, this.#langue));
    const l = 240;
    const h = 130;
    CHOIX_COULEURS.forEach((couleur: Couleur, i) => {
      const x = LARGEUR / 2 + (i % 2 === 0 ? -1 : 1) * (l / 2 + 8);
      const y = haut + 80 + h / 2 + Math.floor(i / 2) * (h + 14);
      const encre = th.couleursRouges.includes(couleur) ? th.encreRouge : th.encreNoire;
      const fond = this.add.graphics();
      fond.fillStyle(th.carteFond).fillRoundedRect(-l / 2, -h / 2, l, h, 16);
      fond.lineStyle(3, th.carteBordure).strokeRoundedRect(-l / 2, -h / 2, l, h, 16);
      const symbole = this.add.text(0, -16, th.symboles[couleur], this.#style(56, encre, true)).setOrigin(0.5);
      // Combien de cartes de cette couleur il garderait en main, pour aider à choisir.
      const enMain = vue.main.filter((c) => c.couleur === couleur && effetDe(vue.options, c) !== 'joker').length;
      const nom = this.add.text(0, 38, `${nomCouleur(couleur, this.#langue)} (${enMain})`, this.#style(20, th.texte, true)).setOrigin(0.5);
      const bouton = this.add.container(x, y, [fond, symbole, nom]).setName(`couleur-${couleur}`);
      bouton.setSize(l, h).setInteractive({ useHandCursor: true });
      bouton.on('pointerup', () => {
        const coup = coupAvecCouleur(coups, couleur);
        this.#fermerSuperpose();
        if (coup) this.#jouerCoup(coup);
      });
      panneau.add(bouton);
    });
    const annuler = this.#bouton(LARGEUR / 2, haut + 470 - 56, 220, TACTILE_MIN, t('huit.annuler', {}, this.#langue), () => this.#fermerSuperpose());
    panneau.add(annuler);
  }

  /** Aide : ce que fait chaque carte spéciale dans cette partie (variantes comprises). */
  #montrerAide(): void {
    const vue = this.#vue;
    if (!vue) return;
    const th = this.#theme;
    const groupes = cartesSpeciales(vue.options);
    const hauteur = 190 + Math.max(1, groupes.length) * 76;
    const { panneau, haut } = this.#ouvrirSuperpose(hauteur, t('huit.aide', {}, this.#langue));
    if (groupes.length === 0) {
      panneau.add(this.add.text(LARGEUR / 2, haut + 100, t('huit.aideAucune', {}, this.#langue), this.#style(19, th.texteDiscret)).setOrigin(0.5));
    }
    groupes.forEach(({ effet, rangs }, i) => {
      const y = haut + 110 + i * 76;
      const exemple = this.#dessinerCarte({ rang: rangs[0]!, couleur: 'coeur' }, 46, 64);
      exemple.setPosition(70, y);
      const valeurs = rangs.map((r) => rangAffiche(r, this.#langue)).join(', ');
      const texte = this.add.text(110, y, `${valeurs} — ${t(`huit.effet.${effet}` as const, {}, this.#langue)}`, {
        ...this.#style(19, th.texte),
        wordWrap: { width: LARGEUR - 160 },
      });
      texte.setOrigin(0, 0.5);
      panneau.add([exemple, texte]);
    });
    panneau.add(this.#bouton(LARGEUR / 2, haut + hauteur - 56, 220, TACTILE_MIN, t('huit.fermer', {}, this.#langue), () => this.#fermerSuperpose()));
  }

  // ——— Sons ———

  #jouerSon(son: Son): void {
    if (!this.#son) return;
    const notes = this.#theme.sons[son];
    const contexte = (this.sound as Partial<Phaser.Sound.WebAudioSoundManager>).context;
    // Le navigateur n'autorise le son qu'après un premier toucher : sinon, silence.
    if (!contexte || contexte.state !== 'running' || notes.length === 0) return;
    try {
      let debut = contexte.currentTime;
      for (const note of notes) {
        const oscillateur = contexte.createOscillator();
        const volume = contexte.createGain();
        const fin = debut + note.duree / 1000;
        oscillateur.frequency.value = note.frequence;
        volume.gain.setValueAtTime(this.#theme.volume, debut);
        volume.gain.exponentialRampToValueAtTime(0.0001, fin);
        oscillateur.connect(volume).connect(contexte.destination);
        oscillateur.start(debut);
        oscillateur.stop(fin);
        debut = fin;
      }
    } catch {
      // Pas de son sur ce téléphone : la partie continue.
    }
  }
}
