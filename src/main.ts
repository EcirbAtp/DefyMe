import { registerSW } from 'virtual:pwa-register';
import { langueDuTelephone, t } from './i18n';
import { registre } from './noyau/registre';
import { stockageDuNavigateur } from './stockage/reglages';
import { demarrerAppli } from './ui/app';
import { el } from './ui/dom';
import './ui/style.css';

const racine = document.getElementById('appli');
if (!racine) throw new Error('Élément #appli introuvable');

demarrerAppli(racine, {
  registre,
  stockage: stockageDuNavigateur(),
  langueDuTelephone: langueDuTelephone(),
  version: __VERSION_APPLI__,
});

// Service worker : l'appli s'ouvre sans réseau une fois chargée (D-D-07).
const majSW = registerSW({
  onNeedRefresh() {
    const bouton = el('button', { type: 'button', class: 'bouton' }, t('mise-a-jour.bouton'));
    bouton.addEventListener('click', () => void majSW(true));
    document.body.append(el('div', { class: 'toast', role: 'status' }, el('span', {}, t('mise-a-jour.dispo')), bouton));
  },
});
