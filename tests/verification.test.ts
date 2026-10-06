import { describe, expect, it } from 'vitest';
import type { Jeu } from '../src/noyau/contrat';
import { verifierJeu } from '../src/noyau/verification';
import { allumettes, type Coup, type Etat } from './exemples/allumettes';

type JeuAllumettes = Jeu<Etat, Coup, Etat, { depart: number }>;
const variante = (modifs: Partial<JeuAllumettes>): JeuAllumettes => ({ ...allumettes, ...modifs });

describe('Vérification du contrat (D-A1-02, D-A1-03, D-A1-07, D-A2-08, D-A2-09)', () => {
  it('accepte un jeu conforme', () => {
    expect(verifierJeu(allumettes)).toEqual([]);
  });

  it('signale une fiche invalide', () => {
    const p = verifierJeu(variante({ fiche: { ...allumettes.fiche, joueursMax: 9, nom: { fr: 'A', en: '' } } }));
    expect(p.join('\n')).toMatch(/joueursMax/);
    expect(p.join('\n')).toMatch(/nom manquant en « en »/);
  });

  it('signale un jeu qui modifie son état au lieu de le recopier', () => {
    const p = verifierJeu(
      variante({
        jouer(etat, _j, coup) {
          (etat as { restantes: number }).restantes -= coup.prendre;
          return etat;
        },
      }),
    );
    expect(p[0]).toMatch(/erreur/);
  });

  it('signale un hasard qui ne vient pas de la graine', () => {
    const p = verifierJeu(
      variante({
        etatInitial: (joueurs, _g, options) => ({
          joueurs: joueurs.length,
          restantes: options.depart,
          courant: Math.floor(Math.random() * 1000) % joueurs.length,
          perdant: null,
        }),
      }),
      { parties: 20 },
    );
    expect(p[0]).toMatch(/même graine/);
  });

  it('signale un état non sérialisable', () => {
    const p = verifierJeu(
      variante({
        etatInitial: (joueurs, graine, options) => ({
          ...allumettes.etatInitial(joueurs, graine, options),
          quand: new Date(0),
        }) as unknown as Etat,
      }),
    );
    expect(p[0]).toMatch(/non sérialisable.*Date/);
  });

  it("signale un ordinateur qui joue un coup interdit", () => {
    const p = verifierJeu(variante({ ordinateur: () => ({ prendre: 4 }) as unknown as Coup }));
    expect(p[0]).toMatch(/coup non permis/);
  });

  it("signale un ordinateur qui dépasse son temps de réflexion", () => {
    const lent = variante({
      fiche: { ...allumettes.fiche, tempsReflexionMaxMs: 5 },
      ordinateur(etat, joueur, r) {
        const fin = performance.now() + 20;
        while (performance.now() < fin);
        return allumettes.ordinateur.call(allumettes, etat, joueur, r);
      },
    });
    expect(verifierJeu(lent, { parties: 1 })[0]).toMatch(/réfléchi/);
  });

  it('signale une partie qui ne se termine pas', () => {
    const p = verifierJeu(variante({ jouer: (etat) => ({ ...etat, courant: (etat.courant + 1) % etat.joueurs }) }), {
      coupsMax: 50,
    });
    expect(p[0]).toMatch(/non finie/);
  });

  it("signale des coups permis à un joueur dont ce n'est pas le tour", () => {
    const p = verifierJeu(variante({ coupsPermis: () => [{ prendre: 1 }] }));
    expect(p[0]).toMatch(/alors que c'est au tour/);
  });
});
