import type { NiveauOrdinateur, Reflexion } from '../../noyau/contrat';
import { Hasard } from '../../noyau/hasard';
import { ARRIVEE, CENTRE, ECURIE, indexParcours } from './plateau';
import { coupsPermis, deplacement, distanceParcours, jouer, type Coup, type Etat } from './regles';

/**
 * L'ordinateur des Petits chevaux (D-A2-08, D-A2-09). Il choisit toujours
 * parmi `coupsPermis`, sans regarder la suite du hasard : il ne connaît pas
 * les dés à venir.
 *
 * - Niveau 1, facile : un débutant. Il joue 8 coups sur 10 au hasard, les
 *   autres comme le niveau moyen.
 * - Niveau 2, moyen : le bon sens d'un joueur moyen. Il prend un cheval
 *   quand il peut, sinon sort un cheval sur un 6, sinon avance son cheval le
 *   plus avancé.
 * - Niveau 3, difficile : il note chaque coup selon le chemin parcouru par
 *   ses chevaux et ceux des adversaires, les prises, et le risque d'être pris
 *   au tour suivant.
 *
 * Taux de victoire visés en duel contre le niveau moyen : 20 %, 50 % et 80 %
 * (D-A2-09). Mesurés sur 2 000 parties (tests/petits-chevaux/niveaux.test.ts) :
 * 20 %, 50 % et 68 %. Le hasard du dé pèse trop pour dépasser 68 % avec
 * une réflexion rapide : c'est le meilleur taux atteint, comme convenu.
 */
export function choisirCoup(etat: Etat, joueur: number, { niveau, graine }: Reflexion): Coup {
  const permis = coupsPermis(etat, joueur);
  if (permis.length === 1) return permis[0]!;
  const h = new Hasard(graine);
  const chevaux = permis.filter((c): c is Extract<Coup, { type: 'avancer' }> => c.type === 'avancer');
  return STRATEGIES[niveau](etat, joueur, chevaux, h);
}

type Avancer = Extract<Coup, { type: 'avancer' }>;
type Strategie = (etat: Etat, joueur: number, coups: Avancer[], h: Hasard) => Coup;

/** Part des coups joués au hasard par le niveau facile. */
const HASARD_FACILE = 0.8;

const STRATEGIES: Record<NiveauOrdinateur, Strategie> = {
  1: (etat, joueur, coups, h) => (h.suivant() < HASARD_FACILE ? h.choisir(coups) : moyen(etat, joueur, coups)),
  2: (etat, joueur, coups) => moyen(etat, joueur, coups),
  3: (etat, joueur, coups) => meilleur(coups, (c) => valeurApres(etat, joueur, c)),
};

/** Le joueur moyen : prendre, sinon sortir un cheval, sinon avancer le plus avancé. */
function moyen(etat: Etat, joueur: number, coups: Avancer[]): Coup {
  return meilleur(coups, (c) => {
    const p = progression(etat, joueur, c.cheval);
    if (prise(etat, joueur, c)) return 1000 + p;
    if (p === ECURIE) return 500;
    return p;
  });
}

function meilleur(coups: Avancer[], note: (c: Avancer) => number): Coup {
  let choix = coups[0]!;
  let max = note(choix);
  for (const c of coups.slice(1)) {
    const n = note(c);
    if (n > max) {
      max = n;
      choix = c;
    }
  }
  return choix;
}

function progression(etat: Etat, joueur: number, cheval: number): number {
  return etat.chevaux[joueur]![cheval]!;
}

function prise(etat: Etat, joueur: number, c: Avancer): boolean {
  return deplacement(etat, joueur, c.cheval, etat.de as number)?.prise != null;
}

/** Valeur de la position si le cheval avance : son avance moins celle des adversaires, risques compris. */
function valeurApres(etat: Etat, joueur: number, c: Avancer): number {
  const apres = jouer(etat, joueur, c);
  if (apres.gagnant === joueur) return Infinity;
  let total = 0;
  for (let j = 0; j < apres.chevaux.length; j++) {
    let somme = 0;
    for (const p of apres.chevaux[j]!) {
      const v = valeurCheval(p);
      somme += v - v * risque(apres, j, p);
    }
    total += j === joueur ? somme : -somme / (apres.chevaux.length - 1);
  }
  return total;
}

/**
 * Valeur d'un cheval selon sa progression, réglée par simulation : sortir
 * compte, l'escalier met à l'abri et chaque marche coûte des lancers.
 */
function valeurCheval(p: number): number {
  if (p === ECURIE) return 0;
  if (p === CENTRE) return 115;
  if (p > ARRIVEE) return 75 + (p - ARRIVEE) * 5;
  return 20 + p;
}

/**
 * Chance approximative que ce cheval soit pris au prochain tour : un sixième
 * par cheval adverse placé de 1 à 6 cases derrière lui, ou prêt à sortir de
 * l'écurie si le cheval est sur sa case de départ.
 */
function risque(etat: Etat, joueur: number, p: number): number {
  if (p < 0 || p > ARRIVEE) return 0;
  const ici = indexParcours(etat.cotes[joueur]!, p);
  let menaces = 0;
  for (let j = 0; j < etat.chevaux.length; j++) {
    if (j === joueur) continue;
    const adverses = etat.chevaux[j]!;
    if (adverses.includes(ECURIE) && indexParcours(etat.cotes[j]!, 0) === ici) menaces++;
    for (const q of adverses) {
      if (q < 0 || q >= ARRIVEE) continue;
      const distance = distanceParcours(indexParcours(etat.cotes[j]!, q), ici);
      if (distance >= 1 && distance <= 6 && q + distance <= ARRIVEE) menaces++;
    }
  }
  return Math.min(1, menaces / 6);
}
