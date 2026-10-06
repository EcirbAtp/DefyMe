import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

/**
 * Lance le serveur de mise en relation en local, dans le même moteur que
 * Cloudflare (workerd, via Miniflare). Aucun accès à Cloudflare n'est requis.
 */
export async function demarrerServeur(): Promise<{ url: string; arreter: () => Promise<void> }> {
  const sortie = await build({
    entryPoints: [new URL('../src/index.ts', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    write: false,
    external: ['cloudflare:workers'],
  });
  const mf = new Miniflare({
    modules: true,
    script: sortie.outputFiles[0]!.text,
    compatibilityDate: '2026-08-01',
    durableObjects: { SALONS: { className: 'Salon', useSQLite: true } },
    host: '127.0.0.1',
    port: 0,
  });
  const url = await mf.ready;
  return { url: url.href.replace(/^http/, 'ws').replace(/\/$/, ''), arreter: () => mf.dispose() };
}
