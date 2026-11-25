// ON5 logo üretici: SVG'leri yazar ve @capacitor/assets için PNG kaynaklarını oluşturur.
// Kullanım: node resources/make-logo.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = __dirname;

// "ON" + 5 numaralı top. (cx, cy) merkez, s ölçek (1 = 1024'lük ikon içinde ~610px genişlik)
function mark(cx, cy, s, id = 'm') {
    const fs_ = 230 * s;           // "ON" font boyutu
    const R = 112 * s;             // top yarıçapı
    const textW = 395 * s;         // "ON" yaklaşık genişliği (Arial Black)
    const gap = 22 * s;
    const total = textW + gap + R * 2;
    const x0 = cx - total / 2;
    const bx = x0 + textW + gap + R;
    return `
    <defs>
        <radialGradient id="${id}-ball" cx="35%" cy="32%" r="75%">
            <stop offset="0" stop-color="#ffb08a"/>
            <stop offset="0.45" stop-color="#e2602f"/>
            <stop offset="1" stop-color="#7a2410"/>
        </radialGradient>
        <radialGradient id="${id}-spot" cx="40%" cy="38%" r="70%">
            <stop offset="0" stop-color="#ffffff"/>
            <stop offset="1" stop-color="#dcdcdc"/>
        </radialGradient>
        <filter id="${id}-sh" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="${10 * s}" stdDeviation="${12 * s}" flood-color="#000" flood-opacity="0.55"/>
        </filter>
    </defs>
    <g filter="url(#${id}-sh)">
        <text x="${x0}" y="${cy + fs_ * 0.36}" font-family="Arial Black, Arial, sans-serif" font-weight="900"
              font-size="${fs_}" fill="#ffffff" letter-spacing="${-6 * s}">ON</text>
        <circle cx="${bx}" cy="${cy}" r="${R}" fill="url(#${id}-ball)"/>
        <circle cx="${bx}" cy="${cy}" r="${R * 0.52}" fill="url(#${id}-spot)"/>
        <text x="${bx}" y="${cy + R * 0.26}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif"
              font-weight="900" font-size="${R * 0.74}" fill="#111">5</text>
        <ellipse cx="${bx - R * 0.38}" cy="${cy - R * 0.5}" rx="${R * 0.3}" ry="${R * 0.16}"
                 transform="rotate(-30 ${bx - R * 0.38} ${cy - R * 0.5})" fill="#ffffff" opacity="0.45"/>
    </g>`;
}

function background(w, h) {
    return `
    <defs>
        <radialGradient id="bg" cx="50%" cy="45%" r="75%">
            <stop offset="0" stop-color="#2a78b3"/>
            <stop offset="0.6" stop-color="#1e5b8a"/>
            <stop offset="1" stop-color="#0b2740"/>
        </radialGradient>
        <pattern id="dots" width="${w / 40}" height="${w / 40}" patternUnits="userSpaceOnUse">
            <circle cx="${w / 80}" cy="${w / 80}" r="${w / 512}" fill="#ffffff" opacity="0.06"/>
        </pattern>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <rect width="${w}" height="${h}" fill="url(#dots)"/>`;
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const files = {
    'logo.svg':            svg(1024, 1024, background(1024, 1024) + mark(512, 512, 1.18)),
    'icon-foreground.svg': svg(1024, 1024, mark(512, 512, 1.22)),
    'icon-background.svg': svg(1024, 1024, background(1024, 1024)),
    'splash.svg':          svg(2732, 2732, background(2732, 2732) + mark(1366, 1366, 1.6)),
    // Uygulama içi üst bar logosu (şeffaf, yatay)
    'logo-inline.svg':     svg(660, 260, mark(330, 130, 1)),
};

(async () => {
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(OUT, name), content);
    }
    const png = (src, dst) => sharp(Buffer.from(files[src])).png().toFile(path.join(OUT, dst));
    await png('logo.svg', 'icon-only.png');
    await png('icon-foreground.svg', 'icon-foreground.png');
    await png('icon-background.svg', 'icon-background.png');
    await png('splash.svg', 'splash.png');
    await png('splash.svg', 'splash-dark.png');
    // Uygulama içi logo PNG olarak gömülür (Android'de Arial Black yok, SVG metni farklı görünür)
    await sharp(Buffer.from(files['logo-inline.svg']), { density: 144 }).png().toFile(path.join(OUT, '..', 'www', 'logo.png'));
    console.log('Logo dosyaları üretildi:', OUT);
})();
