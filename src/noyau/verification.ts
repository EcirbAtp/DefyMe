import {
  NIVEAUX_ORDINATEUR,
  TEMPS_REFLEXION_PAR_DEFAUT_MS,
  type Jeu,
  type Joueur,
  type NiveauOrdinateur,
} from './contrat';
import { Hasard } from './hasard';
import { problemesFiche } from './registre';
import { rejouerPartie, type CoupJoue } from './session';
import { copieJson, gelerProfond, memeValeur, problemeSerialisation } from './serialisation';

/**
 * Vérification automatique d'un jeu contre le contrat (D-A1-02, D-A1-03,
 * D-A1-07, D-A2-08, D-A2-09). Chaque jeu l'appelle dans ses tests :
 *
 *   expect(verifierJeu(monJeu)).toEqual([]);
 *
 * Elle joue des parties complètes entre ordinateurs de tous niveaux, pour
 * chaque nombre de joueurs permis, et contrôle à chaque coup :
 * - que les règles ne modifient pas leurs arguments (état gelé) ;
 * - que l'état, les coups et les vues survivent à JSON ;
 * - que le joueur courant a toujours au moins un coup permis, et les autres aucun ;
 * - que l'ordinateur choisit un coup permis, dans le temps imparti ;
 * - que la même graine et les mêmes coups redonnent exactement le même état ;
 * - que la partie se termine.
 */
export interface OptionsVerification<Options> {
  /** Nombre de parties par nombre de joueurs. Défaut : 5. */
  parties?: number;
  /** Graine de départ des parties de vérification. Défaut : 1. */
  graine?: number;
  /** Coups au-delà desquels on considère que la partie ne finit pas. Défaut : 5000. */
  coupsMax?: number;
  /** Options du jeu à tester. Défaut : `optionsParDefaut`. */
  options?: Options;
  /** Tolérance sur le temps de réflexion, en multiple du plafond. Défaut : 1.5. */
  toleranceTemps?: number;
}

export function verifierJeu<E, C, V, O>(jeu: Jeu<E, C, V, O>, reglages: OptionsVerification<O> = {}): string[] {
  const problemes = problemesFiche(jeu);
  if (problemes.length > 0) return problemes.map((p) => `fiche : ${p}`);

  const parties = reglages.parties ?? 5;
  const coupsMax = reglages.coupsMax ?? 5000;
  const options = reglages.options ?? jeu.optionsParDefaut;
  const plafond = jeu.fiche.tempsReflexionMaxMs ?? TEMPS_REFLEXION_PAR_DEFAUT_MS;
  const tolerance = plafond * (reglages.toleranceTemps ?? 1.5);
  const hasard = new Hasard(reglages.graine ?? 1);

  const pSerial = problemeSerialisation(options);
  if (pSerial) return [`options non sérialisables : ${pSerial}`];

  for (let n = jeu.fiche.joueursMin; n <= jeu.fiche.joueursMax; n++) {
    const joueurs: Joueur[] = Array.from({ length: n }, (_, i) => ({ pseudo: `J${i + 1}`, couleur: '#000000' }));
    for (let partie = 0; partie < parties; partie++) {
      const graine = hasard.graine();
      const niveaux = joueurs.map((_, i) => NIVEAUX_ORDINATEUR[(partie + i) % NIVEAUX_ORDINATEUR.length] as NiveauOrdinateur);
      const contexte = `${n} joueurs, graine ${graine}`;
      const erreur = jouerUnePartie(jeu, joueurs, graine, options, niveaux, coupsMax, tolerance, hasard, contexte);
      if (erreur) return [erreur];
    }
  }
  return [];
}

function jouerUnePartie<E, C, V, O>(
  jeu: Jeu<E, C, V, O>,
  joueurs: Joueur[],
  graine: number,
  options: O,
  niveaux: NiveauOrdinateur[],
  coupsMax: number,
  tolerance: number,
  hasard: Hasard,
  contexte: string,
): string | null {
  const plafond = jeu.fiche.tempsReflexionMaxMs ?? TEMPS_REFLEXION_PAR_DEFAUT_MS;
  try {
    let etat = gelerProfond(jeu.etatInitial(gelerProfond(copieJson(joueurs)), graine, gelerProfond(copieJson(options))));
    const bis = jeu.etatInitial(copieJson(joueurs), graine, copieJson(options));
    if (!memeValeur(etat, bis)) return `${contexte} : etatInitial donne deux états différents avec la même graine`;

    const coups: CoupJoue<C>[] = [];
    for (let i = 0; i <= coupsMax; i++) {
      const p = verifierEtat(jeu, etat, joueurs.length);
      if (p) return `${contexte}, coup ${i} : ${p}`;
      if (jeu.estFini(etat)) break;
      if (i === coupsMax) return `${contexte} : partie non finie après ${coupsMax} coups`;

      const courant = jeu.joueurCourant(etat);
      if (!Number.isInteger(courant) || courant < 0 || courant >= joueurs.length) {
        return `${contexte}, coup ${i} : joueurCourant invalide (${courant})`;
      }
      const permis = jeu.coupsPermis(etat, courant);
      if (permis.length === 0) return `${contexte}, coup ${i} : aucun coup permis pour le joueur courant ${courant}`;
      for (let autre = 0; autre < joueurs.length; autre++) {
        if (autre !== courant && jeu.coupsPermis(etat, autre).length > 0) {
          return `${contexte}, coup ${i} : le joueur ${autre} a des coups permis alors que c'est au tour de ${courant}`;
        }
      }
      const pCoups = problemeSerialisation(permis);
      if (pCoups) return `${contexte}, coup ${i} : coups non sérialisables : ${pCoups}`;

      // L'ordinateur, au niveau de ce joueur, doit choisir un coup permis à temps.
      const niveau = niveaux[courant] as NiveauOrdinateur;
      const debut = performance.now();
      const coup = jeu.ordinateur(etat, courant, { niveau, tempsMaxMs: plafond, graine: hasard.graine() });
      const duree = performance.now() - debut;
      if (!permis.some((c) => memeValeur(c, coup))) {
        return `${contexte}, coup ${i} : l'ordinateur niveau ${niveau} a choisi un coup non permis : ${JSON.stringify(coup)}`;
      }
      if (duree > tolerance) {
        return `${contexte}, coup ${i} : l'ordinateur niveau ${niveau} a réfléchi ${Math.round(duree)} ms (plafond ${plafond} ms)`;
      }
      // Coup joué à travers JSON, comme s'il arrivait du réseau.
      const recu = gelerProfond(copieJson(coup));
      etat = gelerProfond(jeu.jouer(etat, courant, recu));
      coups.push({ joueur: courant, coup: recu });
    }

    const rejoue = rejouerPartie(jeu, copieJson(joueurs), graine, copieJson(options), copieJson(coups));
    if (!memeValeur(rejoue, etat)) return `${contexte} : la partie rejouée avec la même graine diffère`;
    return null;
  } catch (e) {
    return `${contexte} : erreur « ${e instanceof Error ? e.message : String(e)} »`;
  }
}

function verifierEtat<E, C, V, O>(jeu: Jeu<E, C, V, O>, etat: E, n: number): string | null {
  const pEtat = problemeSerialisation(etat);
  if (pEtat) return `état non sérialisable : ${pEtat}`;
  if (!memeValeur(copieJson(etat), etat)) return 'état modifié par un passage en JSON';
  const fin = jeu.estFini(etat);
  if (fin !== null) {
    const pFin = problemeSerialisation(fin);
    if (pFin) return `fin non sérialisable : ${pFin}`;
    if (!Array.isArray(fin.gagnants) || fin.gagnants.some((g) => !Number.isInteger(g) || g < 0 || g >= n)) {
      return `gagnants invalides : ${JSON.stringify(fin.gagnants)}`;
    }
  }
  for (let j = 0; j < n; j++) {
    const pVue = problemeSerialisation(jeu.vuePour(etat, j));
    if (pVue) return `vue du joueur ${j} non sérialisable : ${pVue}`;
  }
  return null;
}
