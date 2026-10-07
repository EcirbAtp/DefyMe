import { t } from '../i18n';
import type { Langue } from '../noyau/contrat';
import type { Registre } from '../noyau/registre';
import { el } from './dom';

/** Menu Jeux, construit à partir du registre (D-A1-04). */
export function afficherMenuJeux(conteneur: HTMLElement, registre: Registre, langue: Langue): void {
  const jeux = registre.lister(langue);
  const liste = el('ul', { class: 'cartes-jeux' });
  for (const jeu of jeux) {
    const { id, nom, description, icone, joueursMin, joueursMax } = jeu.fiche;
    const joueurs =
      joueursMin === joueursMax ? t('jeux.joueursFixe', { n: joueursMin }) : t('jeux.joueurs', { min: joueursMin, max: joueursMax });
    liste.append(
      el(
        'li',
        {},
        el(
          'a',
          { class: 'carte-jeu', href: `#/jeu/${id}`, 'data-jeu': id },
          el('span', { class: 'carte-jeu__icone', 'aria-hidden': 'true' }, icone),
          el(
            'span',
            { class: 'carte-jeu__texte' },
            el('strong', {}, nom[langue]),
            el('span', { class: 'carte-jeu__joueurs' }, joueurs),
            el('span', { class: 'carte-jeu__description' }, description[langue]),
          ),
        ),
      ),
    );
  }
  conteneur.replaceChildren(
    el('h1', {}, t('jeux.titre')),
    jeux.length > 0 ? liste : el('p', { class: 'vide' }, t('jeux.vide')),
    // Un invité entre ici par le code reçu de l'hôte (D-A3-02).
    jeux.length > 0
      ? el('div', { class: 'actions' }, el('a', { class: 'bouton bouton--discret', href: '#/rejoindre', 'data-action': 'rejoindre-salon' }, t('salon.rejoindre')))
      : '',
  );
}
