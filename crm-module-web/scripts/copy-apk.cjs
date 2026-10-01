// 안드로이드 빌드 결과(APK)를 설치 안내 페이지(/app)가 가리키는 public/downloads/ 로 복사한다.
// dist/ 가 이미 있으면 거기에도 넣어 재빌드 없이 preview 로 바로 받을 수 있게 한다.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!fs.existsSync(src)) {
  console.error('APK 가 없습니다. 먼저 android 에서 gradlew assembleDebug 를 실행하세요:', src);
  process.exit(1);
}
for (const dir of ['public', 'dist']) {
  const target = path.join(root, dir, 'downloads');
  if (dir === 'dist' && !fs.existsSync(path.join(root, 'dist'))) continue;
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(src, path.join(target, 'tara-crm.apk'));
  console.log('copied →', path.relative(root, path.join(target, 'tara-crm.apk')), `(${(fs.statSync(src).size / 1024 / 1024).toFixed(1)} MB)`);
}
