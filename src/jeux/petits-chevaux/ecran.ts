import Phaser from 'phaser';
import { ECRAN, type DonneesEcran, type Langue } from '../../noyau/contrat';
import { CENTRE, CHEVAUX, COTES, ECURIE, PARCOURS, TAILLE, caseDuCheval, type Case } from './plateau';
import { deplacement, type Coup, type Vue } from './regles';
import { THEME_PAR_DEFAUT, couleurNumerique, type ThemePetitsChevaux } from './theme';

/**
 * Écran des Petits chevaux (scène Phaser), pensé pour le portrait et une
 * main (D-C-04) : le plateau en haut, le dé et les boutons des chevaux en
 * bas, à portée de pouce, avec des zones tactiles d'au moins 44 px une fois
 * l'écran mis à l'échelle d'un téléphone de 360 px de large.
 *
 * L'écran ne connaît que la vue du joueur et ne fait que proposer des coups :
 * la session les valide (D-A2-02). Couleurs et formes viennent du pack de
 * thème (D-A1-09).
 */

const LARGEUR = ECRAN.largeur;
const HAUTEUR = ECRAN.hauteur;
const CASE = LARGEUR / TAILLE;
const HAUT_PANNEAU = LARGEUR + 10;
const TAILLE_DE = 120;
const BOUTON = { largeur: 100, hauteur: 92 };

const TEXTES: Record<Langue, Record<string, string>> = {
  fr: {
    lancer: 'À toi : touche le dé',
    choisir: 'Choisis un cheval',
    bloque: 'Aucun cheval ne peut avancer',
    tour: 'Au tour de {nom}',
    gagne: '{nom} a gagné !',
    gagneMoi: 'Tu as gagné !',
    de: '{nom} a fait {de}',
    prise: '{nom} renvoie un cheval de {victime} à l’écurie',
    passe: '{nom} passe son tour',
    rejoue: '{nom} rejoue',
  },
  en: {
    lancer: 'Your turn: tap the die',
    choisir: 'Pick a horse',
    bloque: 'No horse can move',
    tour: "{nom}'s turn",
    gagne: '{nom} wins!',
    gagneMoi: 'You win!',
    de: '{nom} rolled {de}',
    prise: '{nom} sends a horse of {victime} back to the stable',
    passe: '{nom} skips a turn',
    rejoue: '{nom} rolls again',
  },
};

type Pion = Phaser.GameObjects.Container & { anneau?: Phaser.GameObjects.Arc };

export class EcranPetitsChevaux extends Phaser.Scene {
  #donnees!: DonneesEcran<Vue, Coup>;
  #theme: ThemePetitsChevaux = THEME_PAR_DEFAUT;
  #vue: Vue | null = null;
  #pions: Pion[][] = [];
  #statut!: Phaser.GameObjects.Text;
  #evenement!: Phaser.GameObjects.Text;
  #de!: Phaser.GameObjects.Container;
  #dessinDe!: Phaser.GameObjects.Graphics;
  #boutons: Phaser.GameObjects.Container[] = [];
  #passeEnAttente: Phaser.Time.TimerEvent | null = null;
  #desabonner: (() => void) | null = null;

  constructor() {
    super('petits-chevaux');
  }

  init(donnees: DonneesEcran<Vue, Coup> & { theme?: ThemePetitsChevaux }): void {
    this.#donnees = donnees;
    if (donnees.theme) this.#theme = donnees.theme;
  }

  create(): void {
    const vue = this.#donnees.vue();
    this.cameras.main.setBackgroundColor(this.#theme.fond);
    this.#dessinerPlateau(vue);
    this.#creerPions(vue);
    this.#creerPanneau();
    this.#desabonner = this.#donnees.surNouvelleVue((v) => this.#afficher(v, true));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.#desabonner?.());
    this.#afficher(vue, false);
  }

  #t(cle: string, variables: Record<string, string | number> = {}): string {
    const modele = TEXTES[this.#donnees.langue][cle] ?? TEXTES.fr[cle] ?? cle;
    return modele.replace(/\{(\w+)\}/g, (_, nom: string) => String(variables[nom] ?? ''));
  }

  #nom(vue: Vue, joueur: number): string {
    return vue.joueurs[joueur]?.pseudo ?? `${joueur + 1}`;
  }

  #couleurCote(vue: Vue, cote: number): number {
    const joueur = vue.cotes.indexOf(cote);
    return joueur < 0 ? this.#theme.neutre : couleurNumerique(vue.joueurs[joueur]!.couleur);
  }

  #dessinerPlateau(vue: Vue): void {
    const th = this.#theme;
    const g = this.add.graphics();
    g.fillStyle(th.plateau).fillRoundedRect(0, 0, LARGEUR, LARGEUR, 16);

    COTES.forEach((cote, i) => {
      const couleur = this.#couleurCote(vue, i);
      // Écurie : le coin de 6 × 6 cases avant la case de départ.
      const [l, c] = cote.ecurie[0]!;
      g.fillStyle(couleur, 0.22).fillRoundedRect((c - 1.5) * CASE + 4, (l - 1.5) * CASE + 4, 6 * CASE - 8, 6 * CASE - 8, 18);
      for (const place of cote.ecurie) {
        const [x, y] = centre(place);
        g.fillStyle(couleur, 0.35).fillCircle(x, y, CASE * 0.62);
      }
      // Escalier, marches numérotées.
      cote.escalier.forEach((marche, k) => {
        this.#case(g, marche, couleur, 0.55);
        const [x, y] = centre(marche);
        this.add.text(x, y, String(k + 1), { fontFamily: th.police, fontSize: '18px', color: th.texte }).setOrigin(0.5).setAlpha(0.7);
      });
    });

    // Parcours, avec la case de départ de chaque côté à sa couleur.
    const departs = new Map(COTES.map((cote, i) => [cote.depart, i]));
    for (let index = 0; index < PARCOURS.length; index++) {
      const cote = departs.get(index);
      const caseParcours = PARCOURS[index]!;
      if (cote === undefined) this.#case(g, caseParcours, th.caseParcours, 1);
      else this.#case(g, caseParcours, this.#couleurCote(vue, cote), 0.9);
    }

    // Centre.
    const [x, y] = centre([7, 7]);
    g.fillStyle(th.caseParcours).fillCircle(x, y, CASE * 0.55);
    g.lineStyle(2, th.bordure).strokeCircle(x, y, CASE * 0.55);
    this.add.text(x, y, th.symboleCentre, { fontFamily: th.police, fontSize: '26px', color: th.texte }).setOrigin(0.5);
  }

  #case(g: Phaser.GameObjects.Graphics, [l, c]: Case, couleur: number, alpha: number): void {
    g.fillStyle(couleur, alpha).fillRoundedRect(c * CASE + 2, l * CASE + 2, CASE - 4, CASE - 4, 7);
    g.lineStyle(1.5, this.#theme.bordure, 0.8).strokeRoundedRect(c * CASE + 2, l * CASE + 2, CASE - 4, CASE - 4, 7);
  }

  #creerPions(vue: Vue): void {
    const th = this.#theme;
    this.#pions = vue.chevaux.map((chevaux, joueur) =>
      chevaux.map((_, cheval) => {
        const couleur = couleurNumerique(vue.joueurs[joueur]!.couleur);
        const anneau = this.add.circle(0, 0, CASE * 0.58).setStrokeStyle(5, th.surbrillance).setVisible(false);
        const disque = this.add.circle(0, 0, CASE * 0.4, couleur).setStrokeStyle(2.5, th.contourPion);
        const numero = this.add
          .text(0, 0, String(cheval + 1), { fontFamily: th.police, fontSize: '19px', fontStyle: 'bold', color: th.texteSurCouleur })
          .setOrigin(0.5);
        numero.setStroke('#00000066', 3);
        const pion: Pion = this.add.container(0, 0, [anneau, disque, numero]);
        pion.anneau = anneau;
        // Zone tactile plus large que le pion, pour le doigt.
        pion.setSize(CASE * 1.4, CASE * 1.4).setInteractive({ useHandCursor: true });
        pion.on('pointerup', () => this.#choisir(joueur, cheval));
        return pion;
      }),
    );
  }

  #creerPanneau(): void {
    const th = this.#theme;
    const style = { fontFamily: th.police, color: th.texte };
    this.#statut = this.add.text(LARGEUR / 2, HAUT_PANNEAU + 22, '', { ...style, fontSize: '26px', fontStyle: 'bold' }).setOrigin(0.5);
    this.#evenement = this.add
      .text(LARGEUR / 2, HAUT_PANNEAU + 56, '', { ...style, fontSize: '19px', color: th.texteDiscret, align: 'center', wordWrap: { width: LARGEUR - 24 } })
      .setOrigin(0.5, 0);

    const yBas = HAUTEUR - 20 - TAILLE_DE / 2;
    this.#dessinDe = this.add.graphics();
    this.#de = this.add.container(20 + TAILLE_DE / 2, yBas, [this.#dessinDe]);
    this.#de.setSize(TAILLE_DE + 20, TAILLE_DE + 20).setInteractive({ useHandCursor: true });
    this.#de.on('pointerup', () => this.#lancer());

    for (let cheval = 0; cheval < CHEVAUX; cheval++) {
      const x = 40 + TAILLE_DE + BOUTON.largeur / 2 + cheval * (BOUTON.largeur + 10);
      const fond = this.add.graphics();
      const texte = this.add
        .text(0, 0, String(cheval + 1), { fontFamily: th.police, fontSize: '36px', fontStyle: 'bold', color: th.texteSurCouleur })
        .setOrigin(0.5);
      const bouton = this.add.container(x, yBas, [fond, texte]);
      bouton.setSize(BOUTON.largeur, BOUTON.hauteur).setInteractive({ useHandCursor: true }).setVisible(false);
      bouton.on('pointerup', () => this.#choisir(this.#donnees.joueur, cheval));
      this.#boutons.push(bouton);
    }
  }

  /** Met l'écran à jour pour une nouvelle vue, en animant les chevaux qui bougent. */
  #afficher(vue: Vue, animer: boolean): void {
    const avant = this.#vue;
    this.#vue = vue;
    this.#passeEnAttente?.remove();
    this.#passeEnAttente = null;

    // Chevaux : déplacement, puis retour à l'écurie du cheval pris.
    vue.chevaux.forEach((chevaux, joueur) =>
      chevaux.forEach((p, cheval) => {
        const pion = this.#pions[joueur]![cheval]!;
        const [x, y] = centre(caseDuCheval(vue.cotes[joueur]!, p, cheval), p === CENTRE ? cheval : -1);
        const bouge = animer && avant !== null && avant.chevaux[joueur]![cheval] !== p;
        this.tweens.killTweensOf(pion);
        if (bouge) {
          const pris = p === ECURIE;
          pion.setDepth(pris ? 1 : 2);
          this.tweens.add({ targets: pion, x, y, duration: this.#theme.dureeDeplacement, delay: pris ? this.#theme.dureeDeplacement : 0, ease: 'Quad.easeInOut' });
        } else pion.setPosition(x, y);
      }),
    );

    const moi = this.#donnees.joueur;
    const aMoi = vue.gagnant === null && vue.courant === moi;
    const jouables = aMoi && vue.de !== null ? this.#chevauxJouables(vue) : [];

    // Statut et dernier événement.
    if (vue.gagnant !== null) this.#statut.setText(vue.gagnant === moi ? this.#t('gagneMoi') : this.#t('gagne', { nom: this.#nom(vue, vue.gagnant) }));
    else if (!aMoi) this.#statut.setText(this.#t('tour', { nom: this.#nom(vue, vue.courant) }));
    else if (vue.de === null) this.#statut.setText(this.#t('lancer'));
    else this.#statut.setText(jouables.length > 0 ? this.#t('choisir') : this.#t('bloque'));
    this.#evenement.setText(this.#texteEvenement(vue));

    // Dé, boutons et anneaux des chevaux jouables.
    this.#dessinerDe(vue.de ?? vue.dernier?.de ?? 6, aMoi && vue.de === null, vue.de === null && vue.dernier === null);
    this.#pions.forEach((pions, joueur) => pions.forEach((pion, cheval) => this.#surligner(pion, joueur === moi && jouables.includes(cheval))));
    const couleur = couleurNumerique(vue.joueurs[moi]?.couleur ?? '#777777');
    this.#boutons.forEach((bouton, cheval) => {
      const visible = jouables.includes(cheval);
      bouton.setVisible(visible);
      if (visible) {
        const fond = bouton.list[0] as Phaser.GameObjects.Graphics;
        fond.clear().fillStyle(couleur).fillRoundedRect(-BOUTON.largeur / 2, -BOUTON.hauteur / 2, BOUTON.largeur, BOUTON.hauteur, 18);
        fond.lineStyle(3, this.#theme.contourPion).strokeRoundedRect(-BOUTON.largeur / 2, -BOUTON.hauteur / 2, BOUTON.largeur, BOUTON.hauteur, 18);
      }
    });

    // Aucun cheval ne peut bouger : on passe tout seul, après un temps pour lire.
    if (aMoi && vue.de !== null && jouables.length === 0) {
      this.#passeEnAttente = this.time.delayedCall(1200, () => this.#donnees.proposerCoup({ type: 'passer' }));
    }
  }

  #chevauxJouables(vue: Vue): number[] {
    const moi = this.#donnees.joueur;
    return (vue.chevaux[moi] ?? []).map((_, cheval) => cheval).filter((cheval) => deplacement(vue, moi, cheval, vue.de as number));
  }

  #texteEvenement(vue: Vue): string {
    const e = vue.dernier;
    if (!e) return '';
    const nom = this.#nom(vue, e.joueur);
    const lignes = [this.#t('de', { nom, de: e.de })];
    if (e.type === 'avancer' && e.prise) lignes.push(this.#t('prise', { nom, victime: this.#nom(vue, e.prise.joueur) }));
    if (e.type === 'passer') lignes.push(this.#t('passe', { nom }));
    if (e.type !== 'lancer' && e.de === 6 && vue.options.rejouerSur6 && vue.gagnant === null) lignes.push(this.#t('rejoue', { nom }));
    return lignes.join('\n');
  }

  #surligner(pion: Pion, actif: boolean): void {
    const anneau = pion.anneau!;
    this.tweens.killTweensOf(anneau);
    anneau.setVisible(actif).setAlpha(1);
    if (actif) {
      pion.setDepth(3);
      this.tweens.add({ targets: anneau, alpha: 0.25, duration: 520, yoyo: true, repeat: -1 });
    }
  }

  #dessinerDe(valeur: number, actif: boolean, vierge: boolean): void {
    const g = this.#dessinDe;
    const th = this.#theme;
    const demi = TAILLE_DE / 2;
    g.clear();
    g.fillStyle(th.de).fillRoundedRect(-demi, -demi, TAILLE_DE, TAILLE_DE, 22);
    g.lineStyle(actif ? 6 : 3, actif ? th.surbrillance : th.bordure).strokeRoundedRect(-demi, -demi, TAILLE_DE, TAILLE_DE, 22);
    if (vierge) return;
    g.fillStyle(th.pointsDe);
    const e = TAILLE_DE * 0.27;
    for (const [px, py] of POINTS_DE[valeur] ?? []) g.fillCircle(px * e, py * e, TAILLE_DE * 0.09);
    this.#de.setAlpha(actif || this.#vue?.de !== null ? 1 : 0.75);
  }

  #lancer(): void {
    const vue = this.#vue;
    if (vue && vue.gagnant === null && vue.courant === this.#donnees.joueur && vue.de === null) {
      this.#donnees.proposerCoup({ type: 'lancer' });
    }
  }

  #choisir(joueur: number, cheval: number): void {
    const vue = this.#vue;
    if (!vue || joueur !== this.#donnees.joueur || vue.courant !== joueur || vue.de === null) return;
    if (this.#chevauxJouables(vue).includes(cheval)) this.#donnees.proposerCoup({ type: 'avancer', cheval });
  }
}

/** Points du dé, en unités autour du centre. */
const POINTS_DE: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** Centre d'une case en pixels ; `decalage` écarte les chevaux réunis au centre. */
function centre([l, c]: Case, decalage = -1): [number, number] {
  const x = (c + 0.5) * CASE;
  const y = (l + 0.5) * CASE;
  if (decalage < 0) return [x, y];
  const angle = (decalage * Math.PI) / 2 + Math.PI / 4;
  return [x + Math.cos(angle) * CASE * 0.32, y + Math.sin(angle) * CASE * 0.32];
}
