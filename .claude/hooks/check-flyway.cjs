#!/usr/bin/env node
/*
 * PreToolUse(Write) 훅 — 새 Flyway 마이그레이션 파일의 버전이 (기존 max)+1 이 아니면 차단.
 * 버전이 겹치거나 건너뛰면 Flyway 부팅 실패(→502)라, 확률에 맡기지 않고 결정론적으로 막는다.
 *
 * 방어적 설계: 애매하거나 에러가 나면 무조건 통과(exit 0). 오직 "확실히 새 마이그레이션인데
 * 버전이 max+1 이 아님"일 때만 차단(exit 2). 이렇게 해서 다른 편집을 절대 방해하지 않는다.
 * (참고: exit 2 만 차단. 그 외 실패는 Claude Code 에서 비차단 경고로 처리되어 편집은 진행됨)
 */
const fs = require('fs');
const path = require('path');

let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(raw || '{}');
    if ((data.tool_name || '') !== 'Write') return process.exit(0);
    const fp = (data.tool_input && data.tool_input.file_path) || '';
    const base = path.basename(fp);
    const m = /^V(\d+)__.*\.sql$/i.exec(base);
    if (!m) return process.exit(0);                          // Flyway 마이그레이션 파일 아님
    if (!/db[\/\\]migration[\/\\]/i.test(fp.replace(/\\/g, '/') + '/')) {
      // migration 폴더 밖(예: bin/main 은 그대로 두되, 확실치 않으면 통과)
      if (!/db\/migration/i.test(fp.replace(/\\/g, '/'))) return process.exit(0);
    }
    const newVer = parseInt(m[1], 10);
    const dir = path.dirname(fp);
    let existing;
    try {
      existing = fs.readdirSync(dir)
        .map((f) => { const mm = /^V(\d+)__.*\.sql$/i.exec(f); return mm ? parseInt(mm[1], 10) : null; })
        .filter((v) => v !== null && v !== newVer);
    } catch (e) {
      return process.exit(0);                                // 폴더 못 읽음 → 판단 불가 → 통과
    }
    if (!existing.length) return process.exit(0);            // 비교 대상 없음 → 통과
    const mx = Math.max.apply(null, existing);
    if (newVer !== mx + 1) {
      process.stderr.write(
        `[Flyway 훅 차단] 새 마이그레이션 버전 V${newVer} 이(가) 잘못됨. ` +
        `기존 최대 = V${mx} → V${mx + 1} 이어야 함 (숫자정렬 max+1). ` +
        `버전이 겹치거나 건너뛰면 Flyway 부팅이 실패(→502)한다. 파일명을 V${mx + 1}__ 로 바꾸세요.\n`
      );
      return process.exit(2);                                // 차단
    }
    return process.exit(0);
  } catch (e) {
    return process.exit(0);                                  // 어떤 에러든 통과(오탐 차단 방지)
  }
});
