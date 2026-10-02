// 안드로이드 APK 빌드 한 번에: cap sync android → android/gradlew.bat assembleDebug → public/dist/downloads 로 복사.
// npm 이 어떤 셸(cmd/sh)로 스크립트를 돌리든 상관없게 Node 에서 직접 프로세스를 띄운다(package.json 안의 백슬래시 문제 회피).
// 필요: JDK 21(JAVA_HOME), Android SDK(ANDROID_HOME), 서버 주소 CAP_SERVER_URL(없으면 capacitor.config.ts 기본값).
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const android = path.join(root, 'android');

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}  (${path.relative(root, cwd) || '.'})`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`실패: ${cmd} (exit ${r.status})`); process.exit(r.status ?? 1); }
}

// 번들 자산(webDir=capacitor-shell)이 바뀌어도 옛 dist 복사본이 남지 않게 비운다
fs.rmSync(path.join(android, 'app', 'src', 'main', 'assets', 'public'), { recursive: true, force: true });
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android'], root);
// npm 은 NoDefaultCurrentDirectoryInExePath 를 켜서 현재 폴더의 실행파일을 이름만으로 못 찾는다 — 절대 경로로 부른다
run(path.join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'), ['assembleDebug'], android);
// 복사는 같은 프로세스에서(node 경로에 공백이 있어 셸로 부르면 깨진다)
require(path.join(__dirname, 'copy-apk.cjs'));
