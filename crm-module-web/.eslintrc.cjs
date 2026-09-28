// ESLint 설정 — 2026-09 화면 정리 시 신설(이전에는 설정 파일이 없어 `npm run lint` 가 실행 불가였음).
// 아래 rules 의 'off' 항목은 기존 코드에 이미 퍼져 있는 패턴(any 타입, 훅 의존성 배열, 컴포넌트 파일의
// 헬퍼 export)을 현행 그대로 허용하기 위한 기준선이다. 정리 후 하나씩 'warn' 으로 올려 잡아 가면 된다.
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', 'playwright-report', 'e2e', 'vite.config.ts', '*.cjs', '*.js', '*.d.ts', '*.mjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'react-refresh/only-export-components': 'off',
  },
};
