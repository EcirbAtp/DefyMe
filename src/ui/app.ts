import { changerLangue, langue, t } from '../i18n';
import type { Langue } from '../noyau/contrat';
import type { Registre } from '../noyau/registre';
import { ecrireReglages, lireReglages, type Reglages, type Stockage } from '../stockage/reglages';
import { appliquerCouleur } from './couleur';
import { el } from './dom';
import { preparerInstallation } from './installation';
import { afficherMenuJeux } from './menu-jeux';
import { afficherPageJeu, quitterPartie, type Monteur } from './partie';
import { afficherParametres } from './parametres';

/**
 * Coquille de l'appli : deux menus seulement, Jeux et Paramètres (D-D-02),
 * sans inscription ni connexion (D-D-01).
 */
export interface Dependances {
  registre: Registre;
  stockage: Stockage | undefined;
  langueDuTelephone: Langue;
  version: string;
  /** Pour les tests : remplace le montage de l'écran Phaser des jeux. */
  monterEcran?: Monteur;
}

export interface Appli {
  reglages(): Reglages;
  afficher(): void;
}

export function demarrerAppli(racine: HTMLElement, deps: Dependances): Appli {
  let reglages = lireReglages(deps.stockage, deps.langueDuTelephone);
  changerLangue(reglages.langue);
  appliquerCouleur(reglages.couleur);

  const zoneInstallation = el('div', { class: 'zone-installation' });
  const contenu = el('main', { id: 'contenu', tabindex: '-1' });
  const lienJeux = el('a', { href: '#/jeux', class: 'onglet' });
  const lienParametres = el('a', { href: '#/parametres', class: 'onglet' });
  const navigation = el('nav', { class: 'onglets' }, lienJeux, lienParametres);
  racine.replaceChildren(zoneInstallation, contenu, navigation);
  const reafficherInstallation = preparerInstallation(zoneInstallation, deps.stockage);

  const enregistrer = (nouveaux: Reglages): void => {
    const langueChangee = nouveaux.langue !== reglages.langue;
    reglages = nouveaux;
    ecrireReglages(deps.stockage, reglages);
    appliquerCouleur(reglages.couleur);
    if (langueChangee) {
      changerLangue(reglages.langue);
      afficher();
      reafficherInstallation();
    } else {
      // On garde le formulaire tel quel (et le focus), avec les réglages à jour.
      afficherParametres(contenu, reglages, enregistrer, deps.version);
    }
  };

  function afficher(): void {
    document.title = t('app.titre');
    lienJeux.textContent = t('nav.jeux');
    lienParametres.textContent = t('nav.parametres');
    const route = location.hash.replace(/^#\/?/, '');
    const [page, id] = route.split('/');
    const [actif, inactif] = page === 'parametres' ? [lienParametres, lienJeux] : [lienJeux, lienParametres];
    actif.setAttribute('aria-current', 'page');
    inactif.removeAttribute('aria-current');

    quitterPartie();
    if (page === 'parametres') afficherParametres(contenu, reglages, enregistrer, deps.version);
    else if (page === 'jeu' && id) {
      afficherPageJeu(contenu, deps.registre, decodeURIComponent(id), {
        langue: langue(),
        reglages,
        stockage: deps.stockage,
        monter: deps.monterEcran,
      });
    } else afficherMenuJeux(contenu, deps.registre, langue());
  }

  window.addEventListener('hashchange', afficher);
  afficher();
  return { reglages: () => reglages, afficher };
}
