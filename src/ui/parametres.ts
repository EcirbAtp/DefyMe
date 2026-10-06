import { NOMS_LANGUES, t } from '../i18n';
import { LANGUES, type Langue } from '../noyau/contrat';
import { COULEURS, PSEUDO_LONGUEUR_MAX, nettoyerPseudo, type Reglages } from '../stockage/reglages';
import { el } from './dom';

/** Menu Paramètres : pseudo, couleur, son, langue (D-D-03). */
export function afficherParametres(
  conteneur: HTMLElement,
  reglages: Reglages,
  enregistrer: (nouveaux: Reglages) => void,
  version: string,
): void {
  const pseudo = el('input', {
    id: 'pseudo',
    type: 'text',
    maxlength: String(PSEUDO_LONGUEUR_MAX),
    autocomplete: 'nickname',
    placeholder: t('joueur.parDefaut'),
    'aria-describedby': 'pseudo-aide',
  });
  pseudo.value = reglages.pseudo;
  pseudo.addEventListener('change', () => {
    pseudo.value = nettoyerPseudo(pseudo.value);
    enregistrer({ ...reglages, pseudo: pseudo.value });
  });

  const couleurs = el('div', { class: 'couleurs', role: 'radiogroup', 'aria-labelledby': 'couleur-titre' });
  COULEURS.forEach((couleur, i) => {
    const radio = el('input', {
      type: 'radio',
      name: 'couleur',
      value: couleur,
      'aria-label': t('parametres.couleurNom', { n: i + 1 }),
      checked: couleur === reglages.couleur,
    });
    radio.style.setProperty('--pastille', couleur);
    radio.addEventListener('change', () => enregistrer({ ...reglages, couleur }));
    couleurs.append(radio);
  });

  const son = el('input', { id: 'son', type: 'checkbox', role: 'switch', checked: reglages.son });
  son.addEventListener('change', () => enregistrer({ ...reglages, son: son.checked }));

  const langue = el('select', { id: 'langue' });
  for (const code of LANGUES) {
    langue.append(el('option', { value: code, selected: code === reglages.langue }, NOMS_LANGUES[code]));
  }
  langue.addEventListener('change', () => enregistrer({ ...reglages, langue: langue.value as Langue }));

  const formulaire = el(
    'form',
    { class: 'parametres' },
    el('label', { for: 'pseudo' }, t('parametres.pseudo')),
    pseudo,
    el('small', { id: 'pseudo-aide' }, t('parametres.pseudoAide')),
    el('span', { id: 'couleur-titre', class: 'etiquette' }, t('parametres.couleur')),
    couleurs,
    el('label', { for: 'son', class: 'ligne' }, el('span', {}, t('parametres.son')), son),
    el('label', { for: 'langue' }, t('parametres.langue')),
    langue,
  );
  formulaire.addEventListener('submit', (e) => e.preventDefault());

  conteneur.replaceChildren(
    el('h1', {}, t('parametres.titre')),
    formulaire,
    el('p', { class: 'discret' }, t('parametres.vieprivee')),
    el('p', { class: 'discret' }, t('parametres.version', { version })),
  );
}
