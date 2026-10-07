const SVG = 'http://www.w3.org/2000/svg';

/**
 * Dessine un QR code en SVG (D-A3-01). La bibliothèque n'est chargée qu'à
 * l'ouverture d'un salon, pour garder le premier chargement léger (D-C-07).
 * Modules noirs sur fond blanc, avec une marge, pour que tout appareil photo le lise,
 * même en thème sombre.
 */
export async function dessinerQr(texte: string, titre: string): Promise<SVGSVGElement> {
  const { encode } = await import('uqr');
  const { data, size } = encode(texte, { ecc: 'M', border: 2 });
  let chemin = '';
  data.forEach((ligne, y) =>
    ligne.forEach((noir, x) => {
      if (noir) chemin += `M${x} ${y}h1v1h-1z`;
    }),
  );
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', titre);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const fond = document.createElementNS(SVG, 'rect');
  fond.setAttribute('width', String(size));
  fond.setAttribute('height', String(size));
  fond.setAttribute('fill', '#ffffff');
  const modules = document.createElementNS(SVG, 'path');
  modules.setAttribute('d', chemin);
  modules.setAttribute('fill', '#000000');
  svg.append(fond, modules);
  return svg;
}
