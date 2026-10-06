import petitsChevaux from '../../src/jeux/petits-chevaux';
import type { Vue } from '../../src/jeux/petits-chevaux/regles';
import type { DonneesEcran } from '../../src/noyau/contrat';
import { ErreurReseau, paireDeCanaux, type Canal } from '../../src/reseau';
import { Ecouteurs } from '../../src/reseau/canal';
import type { AccesReseau } from '../../src/salon/acces';
import type { Monteur } from '../../src/ui/partie';

/**
 * Faux serveur de mise en relation, en mémoire : un salon par code, et une
 * paire de canaux pour chaque invité qui le rejoint. Il remplace le serveur
 * et WebRTC dans les tests d'écrans.
 */
export function fauxServeur(codes = ['K7Q2', 'BCDE', 'FGHJ']) {
  const salons = new Map<string, Ecouteurs<Canal>>();
  let erreurOuverture: ErreurReseau | null = null;
  let erreurEntree: ErreurReseau | null = null;
  const acces: AccesReseau = {
    async ouvrir() {
      if (erreurOuverture) throw erreurOuverture;
      const code = codes.shift()!;
      const canaux = new Ecouteurs<Canal>();
      salons.set(code, canaux);
      return {
        code,
        surCanal: (rappel) => canaux.ajouter(rappel),
        surFermeture: () => () => {},
        fermer: () => void salons.delete(code),
      };
    },
    async rejoindre(code) {
      if (erreurEntree) throw erreurEntree;
      const salon = salons.get(code);
      if (!salon) throw new ErreurReseau('salon-introuvable');
      const [chezHote, chezInvite] = paireDeCanaux();
      salon.prevenir(chezHote);
      return chezInvite;
    },
  };
  return {
    acces,
    salons,
    /** Le prochain salon ouvert échouera avec cette erreur (`null` : plus d'échec). */
    echouerOuverture: (e: ErreurReseau | null) => void (erreurOuverture = e),
    echouerEntree: (e: ErreurReseau | null) => void (erreurEntree = e),
    /** Ouvre un canal vers l'hôte du salon, comme le ferait un invité. */
    canalVers: (code: string) => acces.rejoindre(code),
  };
}

/** Écran de Petits chevaux simulé : joue tout seul le premier coup permis quand c'est son tour. */
export function ecranAutomatique(): { monter: Monteur; ecrans: DonneesEcran<Vue, unknown>[]; demontes: number } {
  const suivi = { ecrans: [] as DonneesEcran<Vue, unknown>[], demontes: 0, monter: null as unknown as Monteur };
  suivi.monter = async (_zone, _charger, brutes) => {
    const donnees = brutes as DonneesEcran<Vue, unknown>;
    suivi.ecrans.push(donnees);
    let actif = true;
    const jouer = (vue: Vue) => {
      if (!actif || vue.gagnant !== null || vue.courant !== donnees.joueur) return;
      const coups = petitsChevaux.coupsPermis({ ...vue, hasard: 0 }, donnees.joueur);
      setTimeout(() => actif && donnees.proposerCoup(coups[0]));
    };
    const desabonner = donnees.surNouvelleVue(jouer);
    jouer(donnees.vue());
    return () => {
      actif = false;
      desabonner();
      suivi.demontes++;
    };
  };
  return suivi;
}

export async function attendre(condition: () => boolean, ms = 10_000): Promise<void> {
  const fin = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > fin) throw new Error('Délai dépassé');
    await new Promise((r) => setTimeout(r, 5));
  }
}
