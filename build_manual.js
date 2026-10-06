// MariaDB + DBeaver 설치 매뉴얼 생성 스크립트
// 실행: node build_manual.js  (캡처 폴더의 이미지를 읽어 PPT 생성, 없는 캡처는 빈 자리로 표시)
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require(process.env.PPTX_SKILL + "/scripts/apply_theme.js");

const IMG_DIR = path.join(__dirname, "캡처");
const OUT = path.join(__dirname, "MariaDB_DBeaver_설치매뉴얼.pptx");

const THEME = {
  name: "MariaDB Manual",
  headFontFace: "Malgun Gothic",
  bodyFontFace: "Malgun Gothic",
  colors: {
    dk1: "1B2333", lt1: "FFFFFF", dk2: "1F305E", lt2: "EEF2F7",
    accent1: "C0765A", accent2: "1F305E", accent3: "2E8B8B",
    accent4: "E6A23C", accent5: "7A869A", accent6: "D94F4F",
    hlink: "2E6DB4", folHlink: "7A5BA5",
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10 x 5.625
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "MariaDB + DBeaver 설치 매뉴얼";
const C = pres.SchemeColor;

// ---------- 레이아웃 ----------
pres.defineSlideMaster({
  title: "TITLE",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 0.7, y: 1.6, w: 8.6, h: 1.3, fontSize: 36, bold: true, color: C.background1, valign: "bottom" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", align: "left", x: 0.7, y: 3.0, w: 8.6, h: 0.9, fontSize: 16, color: C.background2, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "SECTION",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 2.3, y: 1.9, w: 7.2, h: 0.9, fontSize: 32, bold: true, color: C.background1, valign: "middle" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", align: "left", x: 2.3, y: 2.8, w: 7.2, h: 0.8, fontSize: 15, color: C.background2, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "STEP",
  background: { color: C.background1 },
  margin: [0.4, 0.5, 0.4, 0.5],
  objects: [
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 0.5, y: 1.05, w: 3.4, h: 0.9, fontSize: 22, bold: true, color: C.text2, valign: "top" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", align: "left", x: 0.5, y: 2.0, w: 3.4, h: 3.0, fontSize: 13, color: C.text1, valign: "top" }, text: "" } },
  ],
  slideNumber: { x: 9.1, y: 5.2, w: 0.5, h: 0.3, fontSize: 9, color: C.accent5, align: "right" },
});
pres.defineSlideMaster({
  title: "TITLE_ONLY",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 0.5, y: 0.35, w: 9.0, h: 0.6, fontSize: 22, bold: true, color: C.text2, valign: "middle" }, text: "" } },
  ],
  slideNumber: { x: 9.1, y: 5.2, w: 0.5, h: 0.3, fontSize: 9, color: C.accent5, align: "right" },
});

pres.defineSlideMaster({
  title: "PAIR",
  background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", align: "left", x: 1.5, y: 0.35, w: 8.0, h: 0.6, fontSize: 22, bold: true, color: C.text2, valign: "middle" }, text: "" } },
  ],
  slideNumber: { x: 9.1, y: 5.2, w: 0.5, h: 0.3, fontSize: 9, color: C.accent5, align: "right" },
});

// ---------- 유틸 ----------
function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// 박스 안에 비율 유지해서 캡처 배치. 파일이 없으면 점선 자리표시.
function addShot(slide, name, box) {
  const file = path.join(IMG_DIR, name + ".png");
  if (!fs.existsSync(file)) {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: box.x, y: box.y, w: box.w, h: box.h, rectRadius: 0.08,
      fill: { color: C.background2 }, line: { color: C.accent5, width: 1, dashType: "dash" },
      objectName: "캡처 자리",
    });
    slide.addText([
      { text: "캡처 이미지 넣을 자리", options: { bold: true, fontSize: 14, color: C.text2, breakLine: true } },
      { text: name + ".png", options: { fontSize: 11, color: C.accent5 } },
    ], { x: box.x, y: box.y, w: box.w, h: box.h, align: "center", valign: "middle", isTextBox: true });
    return;
  }
  const { w, h } = pngSize(file);
  const scale = Math.min(box.w / w, box.h / h);
  const iw = w * scale, ih = h * scale;
  const ix = box.x + (box.w - iw) / 2, iy = box.y + (box.h - ih) / 2;
  slide.addShape(pres.shapes.RECTANGLE, {
    x: ix, y: iy, w: iw, h: ih, fill: { color: C.background1 },
    line: { color: "D5DBE5", width: 0.75 },
    shadow: { type: "outer", color: "1B2333", opacity: 0.18, blur: 6, offset: 2, angle: 90 },
    objectName: "캡처 테두리",
  });
  slide.addImage({ path: file, x: ix, y: iy, w: iw, h: ih, altText: name, objectName: name });
}

// 단계 번호 칩 (모든 단계 슬라이드 공통 모티프)
function addChip(slide, label, section) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: 0.5, y: 0.45, w: 0.85, h: 0.42, rectRadius: 0.21, fill: { color: C.accent1 }, objectName: "단계 번호",
  });
  slide.addText(label, { x: 0.5, y: 0.45, w: 0.85, h: 0.42, fontSize: 13, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true });
  slide.addText(section, { x: 1.5, y: 0.45, w: 2.6, h: 0.42, fontSize: 11, color: C.accent5, valign: "middle", margin: 0, isTextBox: true });
}

function bullets(items) {
  return items.map((t, i) => {
    const runs = typeof t === "string" ? { text: t } : t;
    return { text: runs.text, options: { bullet: !runs.head, paraSpaceAfter: 6, breakLine: i < items.length - 1, bold: !!runs.bold, color: runs.warn ? C.accent6 : undefined } };
  });
}

// 단계 슬라이드: 왼쪽 설명 / 오른쪽 캡처
function step(sectionTitle, sectionName, label, title, items, shot, notes) {
  const s = pres.addSlide({ masterName: "STEP", sectionTitle });
  addChip(s, label, sectionName);
  s.addText(title, { placeholder: "title" });
  s.addText(bullets(items), { placeholder: "body" });
  addShot(s, shot, { x: 4.2, y: 0.45, w: 5.3, h: 4.65 });
  if (notes) s.addNotes(notes);
  return s;
}

// 캡처 2장 슬라이드
function stepPair(sectionTitle, sectionName, label, title, left, right) {
  const s = pres.addSlide({ masterName: "PAIR", sectionTitle });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 0.44, w: 0.85, h: 0.42, rectRadius: 0.21, fill: { color: C.accent1 }, objectName: "단계 번호" });
  s.addText(label, { x: 0.5, y: 0.44, w: 0.85, h: 0.42, fontSize: 13, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addText(title, { placeholder: "title" });
  [left, right].forEach((p, i) => {
    const x = 0.5 + i * 4.6;
    addShot(s, p.shot, { x, y: 1.15, w: 4.4, h: 3.25 });
    s.addText(p.caption, { x, y: 4.5, w: 4.4, h: 0.6, fontSize: 12, color: C.text1, valign: "top", margin: 0, isTextBox: true });
  });
  return s;
}

// ---------- 표지 ----------
pres.addSection({ title: "표지" });
{
  const s = pres.addSlide({ masterName: "TITLE", sectionTitle: "표지" });
  s.addText("MariaDB + DBeaver\n설치 · 설정 매뉴얼", { placeholder: "title" });
  s.addText("로컬 개발용 DB 설치부터 데이터베이스 생성까지", { placeholder: "body" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: 4.35, w: 2.6, h: 0.42, rectRadius: 0.21, fill: { color: C.accent1 }, objectName: "버전 칩" });
  s.addText("MariaDB 12.3.3 · DBeaver 26.2.2", { x: 0.7, y: 4.35, w: 2.6, h: 0.42, fontSize: 11, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true });
}

// ---------- 목차 ----------
pres.addSection({ title: "목차" });
{
  const s = pres.addSlide({ masterName: "TITLE_ONLY", sectionTitle: "목차" });
  s.addText("진행 순서", { placeholder: "title" });
  const cards = [
    { n: "1", t: "MariaDB 설치", d: "DB 서버 설치\nroot 비밀번호 · 포트 설정\n서비스 실행 확인" },
    { n: "2", t: "DBeaver 설치", d: "DB 관리 도구 설치\n한국어 · Java 포함 설치" },
    { n: "3", t: "연결 및 DB 생성", d: "MariaDB 접속 연결\n데이터베이스 생성\nSQL 편집기로 테이블 생성" },
  ];
  cards.forEach((c, i) => {
    const x = 0.5 + i * 3.1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.3, w: 2.8, h: 3.4, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: C.background2 }, objectName: `카드 ${c.n}` });
    s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: 1.6, w: 0.7, h: 0.7, fill: { color: C.accent1 }, objectName: `번호 ${c.n}` });
    s.addText(c.n, { x: x + 0.3, y: 1.6, w: 0.7, h: 0.7, fontSize: 24, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true });
    s.addText(c.t, { x: x + 0.3, y: 2.5, w: 2.3, h: 0.5, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true });
    s.addText(c.d, { x: x + 0.3, y: 3.05, w: 2.3, h: 1.5, fontSize: 12, color: C.text1, margin: 0, valign: "top", paraSpaceAfter: 4, isTextBox: true });
  });
}

function section(title, num, sub) {
  pres.addSection({ title });
  const s = pres.addSlide({ masterName: "SECTION", sectionTitle: title });
  s.addShape(pres.shapes.OVAL, { x: 0.8, y: 1.9, w: 1.2, h: 1.2, fill: { color: C.accent1 }, objectName: "섹션 번호" });
  s.addText(num, { x: 0.8, y: 1.9, w: 1.2, h: 1.2, fontSize: 40, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addText(title, { placeholder: "title" });
  s.addText(sub, { placeholder: "body" });
}

// ---------- 1. MariaDB ----------
const S1 = "1. MariaDB 설치", N1 = "MariaDB 설치";
section(S1, "1", "DB 서버를 내 PC에 설치하고 서비스로 실행합니다");
step(S1, N1, "1-1", "설치 파일 다운로드", [
  "mariadb.org/download 접속",
  "Version: MariaDB Server 12.3.3",
  "OS: Windows / x86_64",
  "Package Type: MSI Package",
  "Mirror 선택 후 [Download]",
], "m01_다운로드페이지");
step(S1, N1, "1-2", "다운로드 확인", [
  "mariadb-12.3.3-winx64.msi (88.6MB) 다운로드 완료 확인",
  "파일을 더블클릭해 설치 시작",
], "m02_다운로드완료");
stepPair(S1, N1, "1-3", "설치 시작 · 라이선스 동의",
  { shot: "m03_설치시작", caption: "설치 마법사 시작 화면에서 [Next]" },
  { shot: "m04_라이선스", caption: "'I accept the terms…' 체크 후 [Next]" });
step(S1, N1, "1-4", "설치 구성 요소", [
  "기본 선택 그대로 [Next]",
  "MariaDB Server, Client Programs, Backup utilities 포함",
  "HeidiSQL은 선택 사항 (DBeaver를 쓸 예정이면 생략 가능)",
], "m05_구성요소");
step(S1, N1, "1-5", "root 비밀번호 설정", [
  "'Modify password for database user root' 체크",
  "New root password / Confirm 입력",
  { text: "비밀번호는 DBeaver 연결 시 다시 필요하니 꼭 기록", bold: true, warn: true },
  "'Enable access from remote machines' 는 체크 해제 (내 PC에서만 접속)",
  "Feedback plugin 은 체크 해제",
], "m06_root비밀번호");
step(S1, N1, "1-6", "서비스 · 포트 설정", [
  "Install as service 체크, Service Name: MariaDB",
  "Enable networking 체크",
  { text: "TCP port: 3306 (기본값)", bold: true },
  "Buffer pool size 는 기본값 사용",
  "[Next]",
], "m07_서비스포트");
step(S1, N1, "1-7", "설치 실행", [
  "[Install] 클릭",
  "관리자 권한 확인 창이 뜨면 [예]",
  "완료 후 [Finish]",
], "m08_설치");
stepPair(S1, N1, "1-8", "서비스 실행 확인",
  { shot: "m09_서비스실행", caption: "Win + R → services.msc 입력 → [확인]" },
  { shot: "m10_서비스확인", caption: "목록에서 MariaDB 상태가 '실행 중', 시작 유형 '자동'이면 정상" });

// ---------- 2. DBeaver ----------
const S2 = "2. DBeaver 설치", N2 = "DBeaver 설치";
section(S2, "2", "DB를 화면에서 관리하는 도구를 설치합니다");
step(S2, N2, "2-1", "설치 파일 다운로드", [
  "dbeaver.io/download 접속",
  "Community 탭 (무료)",
  "Windows [Download EXE] 클릭",
  "다운로드한 exe 실행",
], "d01_다운로드페이지");
stepPair(S2, N2, "2-2", "언어 선택 · 설치 시작",
  { shot: "d02_언어선택", caption: "설치 언어 '한국어' 선택 → [OK]" },
  { shot: "d03_설치시작", caption: "설치 시작 화면에서 [다음]" });
stepPair(S2, N2, "2-3", "라이선스 · 사용자 선택",
  { shot: "d04_라이선스", caption: "Apache License 확인 → [동의함]" },
  { shot: "d05_사용자선택", caption: "'For me (user)' 선택 → [다음]" });
step(S2, N2, "2-4", "구성 요소 선택", [
  { text: "'Include Java' 체크 유지", bold: true },
  "PC에 Java가 없어도 DBeaver가 동작하도록 함께 설치",
  "나머지 항목은 선택 사항",
  "[다음]",
], "d06_구성요소");
stepPair(S2, N2, "2-5", "설치 위치 · 시작 메뉴",
  { shot: "d07_설치위치", caption: "설치 폴더는 기본값 그대로 [다음]" },
  { shot: "d08_시작메뉴", caption: "시작 메뉴 폴더 확인 → [설치]" });

// ---------- 3. 연결 및 DB 생성 ----------
const S3 = "3. 연결 및 DB 생성", N3 = "연결 및 DB 생성";
section(S3, "3", "DBeaver에서 MariaDB에 접속하고 데이터베이스를 만듭니다");
step(S3, N3, "3-1", "DBeaver 첫 실행 설정", [
  "처음 실행하면 Configure DBeaver 창 표시",
  "Language: 한국어 확인",
  "[Apply] 클릭",
], "c01_초기설정");
step(S3, N3, "3-2", "새 연결 만들기", [
  "왼쪽 위 '새 데이터베이스 연결' 아이콘 (플러그 모양) 클릭",
  "단축키: Ctrl + Shift + N",
], "c02_새연결");
step(S3, N3, "3-3", "MariaDB 선택", [
  "데이터베이스 목록에서 MariaDB 선택",
  "[다음]",
], "c03_MariaDB선택");
step(S3, N3, "3-4", "접속 정보 입력", [
  "Server Host: localhost",
  "Port: 3306",
  "Username: root",
  { text: "Password: 1-5에서 설정한 root 비밀번호", bold: true },
  "'Save password' 체크",
  "왼쪽 아래 [Test Connection …] 클릭",
], "c04_접속정보");
step(S3, N3, "3-5", "드라이버 다운로드", [
  "처음 연결할 때 MariaDB JDBC 드라이버 다운로드 창 표시",
  "[Download] 클릭 (인터넷 연결 필요)",
], "c05_드라이버다운로드");
step(S3, N3, "3-6", "연결 성공 확인", [
  "'Connected' 메시지가 보이면 성공",
  "[확인] → [완료]",
  { text: "실패하면: 비밀번호, 포트(3306), MariaDB 서비스 실행 여부 확인", warn: true },
], "c06_연결성공");
step(S3, N3, "3-7", "연결 확인", [
  "왼쪽 Connections 에 localhost 연결 생성",
  "Databases 아래 기본 test 데이터베이스가 보이면 정상",
], "c07_연결확인");
step(S3, N3, "3-8", "데이터베이스 생성", [
  "Databases 우클릭",
  "[Create New Database] 클릭 (Alt + Insert)",
  "Database name 입력 (예: tara_project)",
  "Charset 은 utf8mb4 권장 (한글 · 이모지 저장)",
  "[확인]",
], "c08_DB생성메뉴");
step(S3, N3, "3-9", "생성 확인", [
  "Databases 아래 tara_project 가 추가되면 완료",
  "보이지 않으면 Databases 우클릭 → [새로 고침] (F5)",
], "c09_DB생성확인");
step(S3, N3, "3-10", "SQL 편집기 열기", [
  "tara_project 우클릭",
  "SQL 편집기 → [새 SQL 편집기] (Ctrl + ])",
  "오른쪽 편집 영역에 SQL 작성",
  "작성한 쿼리는 Ctrl + Enter 로 실행",
], "c10_SQL편집기");
{
  const s = pres.addSlide({ masterName: "PAIR", sectionTitle: S3 });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 0.44, w: 0.85, h: 0.42, rectRadius: 0.21, fill: { color: C.accent1 }, objectName: "단계 번호" });
  s.addText("3-11", { x: 0.5, y: 0.44, w: 0.85, h: 0.42, fontSize: 13, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0, isTextBox: true });
  s.addText("테이블 생성 (예시)", { placeholder: "title" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 1.15, w: 5.4, h: 3.75, rectRadius: 0.1, fill: { color: C.text1 }, objectName: "SQL 예시 배경" });
  s.addText(
    "CREATE TABLE employee (\n" +
    "  id         BIGINT AUTO_INCREMENT PRIMARY KEY,\n" +
    "  name       VARCHAR(50)  NOT NULL,\n" +
    "  dept       VARCHAR(50),\n" +
    "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n" +
    ") DEFAULT CHARSET = utf8mb4;\n\n" +
    "INSERT INTO employee (name, dept)\n" +
    "VALUES ('홍길동', '개발팀');\n\n" +
    "SELECT * FROM employee;",
    { x: 0.75, y: 1.35, w: 5.0, h: 3.4, fontFace: "Courier New", fontSize: 11, color: "E8ECF3", valign: "top", margin: 0, isTextBox: true });
  s.addText(bullets([
    { text: "실행 방법", bold: true, head: true },
    "커서를 쿼리 위에 두고 Ctrl + Enter : 한 문장 실행",
    "Alt + X : 스크립트 전체 실행",
    "왼쪽 tara_project → Tables 우클릭 → 새로 고침 하면 생성된 테이블 확인",
    { text: "테이블 이름과 컬럼은 프로젝트에 맞게 수정해서 사용", warn: true },
  ]), { x: 6.2, y: 1.15, w: 3.3, h: 3.75, fontSize: 12, color: C.text1, valign: "top", isTextBox: true });
}

// ---------- 정리 ----------
pres.addSection({ title: "정리" });
{
  const s = pres.addSlide({ masterName: "TITLE", sectionTitle: "정리" });
  s.addText("접속 정보 요약", { x: 0.7, y: 0.5, w: 8.6, h: 0.8, fontSize: 28, bold: true, color: C.background1, valign: "middle", margin: 0, isTextBox: true });
  const rows = [
    ["항목", "값"],
    ["Host", "localhost"],
    ["Port", "3306"],
    ["User", "root"],
    ["Password", "설치 시 지정한 root 비밀번호"],
    ["Database", "tara_project"],
    ["JDBC URL", "jdbc:mariadb://localhost:3306/tara_project"],
  ].map((r, i) => r.map((v) => ({ text: v, options: { bold: i === 0, color: i === 0 ? THEME.colors.lt1 : THEME.colors.dk1, fill: { color: i === 0 ? THEME.colors.accent1 : (i % 2 ? "FFFFFF" : THEME.colors.lt2) } } })));
  s.addTable(rows, { x: 0.7, y: 1.6, w: 8.6, colW: [2.2, 6.4], fontSize: 13, rowH: 0.42, border: { type: "solid", color: "D5DBE5", pt: 0.75 }, valign: "middle" });
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  const missing = fs.readFileSync(__filename, "utf8").match(/"[mdc]\d\d_[^"]+"/g)
    .map((s) => s.slice(1, -1)).filter((n, i, a) => a.indexOf(n) === i && !fs.existsSync(path.join(IMG_DIR, n + ".png")));
  console.log("생성:", OUT);
  console.log("없는 캡처:", missing.join(", ") || "없음");
})();
