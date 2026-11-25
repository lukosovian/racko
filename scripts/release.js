// Yeni sürüm yayınla: android/app/build.gradle'daki sürümü bir artır, APK derle, GitHub'a release olarak yükle.
// Kullanım: npm run release -- "Bu sürümde neler var"
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const gradle = path.join(root, 'android/app/build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
let code = +g.match(/versionCode (\d+)/)[1] + 1;
let name = g.match(/versionName "([\d.]+)"/)[1].split('.').map(Number);
name[name.length - 1]++;
name = name.join('.');
if (process.argv.includes('--keep')) { code--; name = g.match(/versionName "([\d.]+)"/)[1]; }
g = g.replace(/versionCode \d+/, 'versionCode ' + code).replace(/versionName "[\d.]+"/, `versionName "${name}"`);
fs.writeFileSync(gradle, g);
const notes = process.argv.slice(2).filter(a => !a.startsWith('--')).join(' ') || 'Racko ' + name;
const run = c => execSync(c, { cwd: root, stdio: 'inherit' });
run('npm run apk');
run('git add -A');
try { run(`git commit -m "Sürüm ${name}"`); } catch (e) {}
run('git push');
fs.writeFileSync(path.join(root, '.release-notes.txt'), notes);
run(`gh release create v${name} Racko.apk --title "Racko ${name}" --notes-file .release-notes.txt`);
fs.unlinkSync(path.join(root, '.release-notes.txt'));
console.log('Yayınlandı: v' + name);
