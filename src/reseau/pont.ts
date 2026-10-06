import type { SessionDePartie } from '../noyau/session';
import type { HoteReseau } from './hote';

export interface OptionsPont {
  /** Place de chaque invité dans la partie, par identifiant de participant. */
  places: ReadonlyMap<number, number>;
  /** Données de lancement envoyées telles quelles aux invités (fiche, joueurs...). */
  donnees?: unknown;
  /**
   * Fait jouer les places tenues par l'ordinateur (robots du salon), après
   * ce délai en millisecondes. Absent : c'est à l'appelant de les faire jouer.
   */
  delaiOrdinateurMs?: number;
}

/**
 * Relie le réseau de l'hôte à la session de partie qui tourne sur son
 * téléphone, sans rien savoir du jeu :
 * - un coup d'invité est validé par la session, à la place de cet invité,
 *   jamais à une autre (D-A2-02) ;
 * - après chaque coup, chaque invité reçoit sa propre vue, et rien de
 *   plus (D-A2-03).
 *
 * Renvoie une fonction qui débranche le pont.
 */
export function brancherPartie<E, C, V, O>(
  hote: HoteReseau,
  session: SessionDePartie<E, C, V, O>,
  options: OptionsPont,
): () => void {
  const { places } = options;
  hote.verrouiller();

  const envoyerVue = (id: number, place: number) =>
    hote.envoyerVue(id, session.vuePour(place), session.joueurCourant, session.fin);
  const diffuser = () => {
    for (const [id, place] of places) envoyerVue(id, place);
  };

  let robot: ReturnType<typeof setTimeout> | undefined;
  const faireJouerRobots = () => {
    if (options.delaiOrdinateurMs === undefined || robot !== undefined || !session.auTourDeLOrdinateur) return;
    robot = setTimeout(() => {
      robot = undefined;
      session.faireJouerOrdinateur();
    }, options.delaiOrdinateurMs);
  };

  const arreterCoups = hote.surCoup(({ id, coup }) => {
    const place = places.get(id);
    if (place === undefined) return hote.refuserCoup(id, 'place-inconnue');
    const resultat = session.proposerCoup(place, coup as C);
    if (!resultat.ok) hote.refuserCoup(id, resultat.raison);
  });
  const arreterSession = session.ecouter(() => {
    diffuser();
    faireJouerRobots();
  });

  for (const [id, place] of places) {
    hote.lancer(id, place, options.donnees ?? null);
    envoyerVue(id, place);
  }
  faireJouerRobots();

  return () => {
    clearTimeout(robot);
    arreterCoups();
    arreterSession();
  };
}
