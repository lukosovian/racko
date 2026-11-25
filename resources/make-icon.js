// Racko uygulama simgesi: parlak siyah top, altın halkalı beyaz dairede eğik "R".
// Kullanım: npm run logo  (node resources/make-icon.js && capacitor-assets generate --android)
// Ayrıca uygulama içi logo www/racko-ball.png üretilir. www/logo.png (ON5 modu) make-logo.js'e aittir.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const OUT = __dirname;
const F = 'Arial Black, Arial, sans-serif';
const gold = id => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset="0.45" stop-color="#ffc21a"/><stop offset="1" stop-color="#b86e00"/></linearGradient>`;
function bg(kind) {
  const c = kind === 'green' ? ['#23b063', '#0e6a33', '#04301a'] : kind === 'dark' ? ['#24364d', '#121c2a', '#06090f'] : ['#3592d2', '#1b5687', '#081d31'];
  return `<defs><radialGradient id="bg" cx="50%" cy="32%" r="85%"><stop offset="0" stop-color="${c[0]}"/><stop offset="0.55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>
  <radialGradient id="spot" cx="50%" cy="45%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#bg)"/><circle cx="512" cy="470" r="470" fill="url(#spot)"/>`;
}
// Gerçekçi parlak top: gövde, kenar ışığı, yumuşak gölge, pencere yansıması; (ox, oy): beyaz dairenin kayması (eğik görünüm)
function ball({ r = 350, cy = 492, body = ['#5c5c5c', '#161616', '#000'], ox = 0, oy = 0, tilt = 0, letter = 'R', letterFill = '#0d2a44', ring = true, letterGold = false }) {
  const cx = 512;
  const wx = cx + ox, wy = cy + oy;
  const wr = r * 0.53;
  // eğik görünüm: daire kaydıkça basıklaşır
  const d = Math.hypot(ox, oy) / r, sq = Math.sqrt(1 - d * d), ang = Math.atan2(oy, ox) * 180 / Math.PI;
  return `<defs>
    <radialGradient id="body" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="${body[0]}"/><stop offset="0.5" stop-color="${body[1]}"/><stop offset="1" stop-color="${body[2]}"/></radialGradient>
    <radialGradient id="rim" cx="50%" cy="50%" r="50%"><stop offset="0.82" stop-color="#8ec5ff" stop-opacity="0"/><stop offset="0.97" stop-color="#8ec5ff" stop-opacity="0.35"/><stop offset="1" stop-color="#8ec5ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="wh" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d8dde3"/></radialGradient>
    <radialGradient id="sh" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity="0.6"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    ${gold('gold')}
    <clipPath id="clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  </defs>
  <ellipse cx="${cx + r * 0.08}" cy="${cy + r * 1.02}" rx="${r * 0.95}" ry="${r * 0.2}" fill="url(#sh)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#body)"/>
  <g clip-path="url(#clip)">
    <g transform="rotate(${ang} ${wx} ${wy}) scale(1) ">
      <g transform="translate(${wx} ${wy}) scale(${sq} 1) translate(${-wx} ${-wy})">
        ${ring ? `<circle cx="${wx}" cy="${wy}" r="${wr * 1.1}" fill="url(#gold)"/>` : ''}
        <circle cx="${wx}" cy="${wy}" r="${wr}" fill="url(#wh)"/>
      </g>
    </g>
    <g transform="translate(${wx} ${wy}) rotate(${tilt}) scale(${0.75 + 0.25 * sq} 1)">
      <text x="0" y="${wr * 0.41}" text-anchor="middle" font-family="${F}" font-size="${wr * 1.18}" fill="${letterGold ? 'url(#gold)' : letterFill}" ${letterGold ? 'stroke="#0d2a44" stroke-width="6"' : ''}>${letter}</text>
    </g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rim)"/>
    <ellipse cx="${cx - r * 0.5}" cy="${cy - r * 0.6}" rx="${r * 0.26}" ry="${r * 0.11}" transform="rotate(-40 ${cx - r * 0.5} ${cy - r * 0.6})" fill="url(#hl)" opacity="0.75"/>
    
  </g>`;
}

const svg = (w, b) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 1024 1024">${b}</svg>`;
const B = { ox: -45, oy: -55, tilt: -12 };
// Adaptif simge: ön plan güvenli alanı ~%66, top küçük tutulur (r 280)
const files = {
    'logo.svg':            svg(1024, bg('blue') + ball(B)),
    'icon-foreground.svg': svg(1024, ball({ ...B, r: 280, cy: 505 })),
    'icon-background.svg': svg(1024, bg('blue')),
    'splash.svg':          svg(2732, bg('blue') + `<g transform="translate(512 512) scale(0.42) translate(-512 -512)">${ball(B)}</g>`),
    'brand.svg':           `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="140 120 744 800">${ball(B)}</svg>`,
};
(async () => {
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name), content);
    const png = (src, dst) => sharp(Buffer.from(files[src])).png().toFile(path.join(OUT, dst));
    await png('logo.svg', 'icon-only.png');
    await png('icon-foreground.svg', 'icon-foreground.png');
    await png('icon-background.svg', 'icon-background.png');
    await png('splash.svg', 'splash.png');
    await png('splash.svg', 'splash-dark.png');
    await sharp(Buffer.from(files['brand.svg'])).png().toFile(path.join(OUT, '..', 'www', 'racko-ball.png'));
    console.log('Racko simge dosyaları üretildi');
})();
