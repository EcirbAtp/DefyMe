import { t } from '../i18n';
import type { Stockage } from '../stockage/reglages';
import { el } from './dom';

/**
 * Invitation à installer l'appli sur l'écran d'accueil (D-D-06).
 * Android (Chrome) propose un bouton ; iPhone (Safari) n'en a pas, on y
 * affiche la marche à suivre.
 */

interface EvenementInstallation extends Event {
  prompt(): Promise<void>;
}

const CLE_MASQUEE = 'defyme.installation.masquee';

export type Plateforme = 'ios' | 'autre';

export function plateforme(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> = navigator): Plateforme {
  const iPadDeguise = /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(nav.userAgent) || iPadDeguise ? 'ios' : 'autre';
}

export function dejaInstallee(): boolean {
  const standaloneIos = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standaloneIos || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Prépare la bannière d'installation, affichée dans `zone` quand c'est utile. */
export function preparerInstallation(zone: HTMLElement, stockage: Stockage | undefined): () => void {
  let evenement: EvenementInstallation | null = null;

  const masquee = (): boolean => {
    try {
      return stockage?.getItem(CLE_MASQUEE) === '1';
    } catch {
      return false;
    }
  };

  const afficher = (): void => {
    zone.replaceChildren();
    if (masquee() || dejaInstallee()) return;
    const ios = plateforme() === 'ios';
    if (!ios && !evenement) return;

    const fermer = el('button', { type: 'button', class: 'bouton bouton--discret' }, t('installation.fermer'));
    fermer.addEventListener('click', () => {
      try {
        stockage?.setItem(CLE_MASQUEE, '1');
      } catch {
        // Stockage indisponible : la bannière reviendra au prochain lancement.
      }
      zone.replaceChildren();
    });

    const actions = el('div', { class: 'banniere__actions' });
    if (!ios && evenement) {
      const installer = el('button', { type: 'button', class: 'bouton' }, t('installation.bouton'));
      installer.addEventListener('click', () => {
        void evenement?.prompt();
        evenement = null;
        zone.replaceChildren();
      });
      actions.append(installer);
    }
    actions.append(fermer);

    zone.replaceChildren(
      el(
        'aside',
        { class: 'banniere', 'aria-label': t('installation.titre') },
        el('p', {}, ios ? t('installation.ios') : t('installation.android')),
        actions,
      ),
    );
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evenement = e as EvenementInstallation;
    afficher();
  });
  window.addEventListener('appinstalled', () => zone.replaceChildren());
  afficher();
  return afficher;
}
