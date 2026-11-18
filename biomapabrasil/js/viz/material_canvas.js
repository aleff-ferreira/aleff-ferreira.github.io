// A navegação em dispositivos lentos usa materiais pré-iluminados. As posições e os raios
// vêm das mesmas instâncias enviadas ao WebGL. A câmera volta aos impostores analíticos em repouso.
const atlas = new Map();
const normal = a => {
  const norma = Math.hypot(...a);
  return a.map(v => v / norma);
};
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const luzes = [
  [[-.48, .76, .65], [3.8, 3.63, 3.42], .34],
  [[.88, .25, -.36], [1.35, 2.4, 2.55], .34],
  [[.2, -.55, .72], [.52, .64, .68], .58],
].map(([direcao, radiancia, rugosidade]) => {
  const l = normal(direcao);
  return { l, h: normal([l[0], l[1], l[2] + 1]), radiancia, rugosidade };
});
const faixa = normal([-.62, .68, .32]);

function refletancia(n, base) {
  const hemisferio = (n[1] + 1) * .5;
  const nv = Math.max(.001, n[2]);
  const rgb = base.map((v,i) => v * ([.11,.16,.17][i] + hemisferio * [.33,.36,.37][i]));
  for (const { l, h, radiancia, rugosidade } of luzes) {
    const nl = Math.max(0, dot(n,l));
    if (!nl) continue;
    const a2 = rugosidade ** 4, nh = Math.max(0, dot(n,h)), k = (rugosidade + 1)**2 / 8;
    const distribuicao = a2 / (Math.PI * (nh*nh*(a2 - 1) + 1)**2);
    const visibilidade = nv/(nv*(1-k) + k) * nl/(nl*(1-k) + k);
    const fresnel = .045 + .955 * (1 - h[2])**5;
    for (let i = 0; i < 3; i++) {
      const difusa = (1 - fresnel) * base[i] / Math.PI;
      const especular = distribuicao * visibilidade * fresnel / (4*nv*nl);
      rgb[i] += (difusa + especular) * nl * radiancia[i];
    }
  }
  const reflexo = [2*n[2]*n[0], 2*n[2]*n[1], 2*n[2]*n[2] - 1];
  const s = Math.max(0, Math.min(1, (dot(reflexo, faixa) - .67) / .31));
  const brilho = s*s*(3 - 2*s);
  return rgb.map((v, i) => {
    const c = v + [.17,.20,.21][i] * brilho;
    return 255 * (c / (.82 + c*.40)) ** (1/2.2);
  });
}

function material(cor) {
  const chave = cor.map(c => Math.round(c*255)).join(',');
  if (atlas.has(chave)) return atlas.get(chave);
  const base = cor.map(c => c**2.2);
  const cv = document.createElement('canvas');
  const n = 64;
  cv.width = cv.height = n;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(n,n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const nx = (x+.5)*2/n - 1, ny = 1 - (y+.5)*2/n;
      const r = nx*nx + ny*ny;
      if (r >= 1) continue;
      const pos = (y*n+x)*4;
      img.data.set(refletancia([nx, ny, Math.sqrt(1-r)], base), pos);
      img.data[pos+3] = Math.min(255, (1 - Math.sqrt(r))*n*128);
    }
  }
  ctx.putImageData(img,0,0);
  const tint = f => 'rgb(' + cor.map(x => Math.min(255, Math.round(x*255*f))).join(',') + ')';
  const cilindro = document.createElement('canvas');
  cilindro.width = 2;
  cilindro.height = 48;
  const pincel = cilindro.getContext('2d');
  const gradiente = pincel.createLinearGradient(0, 48, 0, 0);
  for (const [t, luz] of [[0,.55],[.34,1.25],[.61,.94],[1,.62]]) gradiente.addColorStop(t, tint(luz));
  pincel.fillStyle = gradiente;
  pincel.fillRect(0, 0, 2, 48);
  const mat = { cv, cilindro };
  // Limita as cores quando a representação é uma superfície de potencial contínuo.
  if (atlas.size >= 192) atlas.delete(atlas.keys().next().value);
  atlas.set(chave, mat);
  return mat;
}

export function prepararSprites(esferas, ligacoes) {
  const bolas = [], hastes = [];
  for (let i = 0; i < esferas.length; i += 8) {
    bolas.push({ p: esferas.slice(i,i+3), r: esferas[i+3], mat: material(esferas.slice(i+4,i+7)) });
  }
  for (let i = 0; i < ligacoes.length; i += 13) {
    const a = ligacoes.slice(i,i+3), b = ligacoes.slice(i+3,i+6), r = ligacoes[i+6];
    const meio = a.map((v,k) => (v + b[k])/2);
    hastes.push({ a, b: meio, r, mat: material(ligacoes.slice(i+7,i+10)) });
    hastes.push({ a: meio, b, r, mat: material(ligacoes.slice(i+10,i+13)) });
  }
  return { bolas, hastes };
}

export function desenharSprites(ctx, modelo, projetar) {
  const itens = [];
  for (const bola of modelo.bolas) {
    const p = projetar(...bola.p);
    itens.push({ z: p.z + bola.r*.72, p, r: bola.r*p.escPx, mat: bola.mat });
  }
  for (const haste of modelo.hastes) {
    const a = projetar(...haste.a), b = projetar(...haste.b);
    itens.push({ z: (a.z+b.z)/2, a, b, r: haste.r*(a.escPx+b.escPx)/2, mat: haste.mat });
  }
  itens.sort((a,b) => a.z - b.z);
  for (const it of itens) {
    if (it.p) {
      ctx.drawImage(it.mat.cv, it.p.sx-it.r, it.p.sy-it.r, 2*it.r, 2*it.r);
      continue;
    }
    const dx = it.b.sx - it.a.sx, dy = it.b.sy - it.a.sy;
    const comprimento = Math.hypot(dx,dy);
    if (comprimento < .01) continue;
    ctx.save();
    ctx.translate(it.a.sx, it.a.sy);
    ctx.transform(dx/comprimento, dy/comprimento, -dy/comprimento, dx/comprimento, 0, 0);
    ctx.drawImage(it.mat.cilindro, 0, -it.r, comprimento + .25, 2*it.r);
    ctx.restore();
  }
}
