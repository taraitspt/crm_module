import type { ColType } from '@/components/table/columnFilterKit';

/**
 * 설비별 작업실적 한 행 — ERP "설비별 작업실적조회" 쿼리의 컬럼명(camelCase) → 값.
 * 컬럼이 90개가 넘어 백엔드가 DTO 없이 Map 으로 내려주고, 라벨·순서·타입은 아래 EQUIP_PERF_COLS 가 정한다.
 */
export type EquipmentPerfRow = Record<string, string | number | null | undefined>;

export interface EquipPerfCol {
  id: string;
  label: string;
  type?: ColType;
  width: number;
  align?: 'right' | 'center';
  fixed?: 'left';
  /** 코드 컬럼 등 평소엔 접어 두는 것 — 컬럼 버튼으로 켤 수 있다 */
  hidden?: boolean;
  /** 열 그룹(엑셀·컬럼 선택에서 묶어 보여줌) */
  group: string;
}

const num = (id: string, label: string, width = 90, group = '수량'): EquipPerfCol => ({ id, label, type: 'amount', width, align: 'right', group });
const en = (id: string, label: string, width: number, group: string, align?: 'center'): EquipPerfCol => ({ id, label, type: 'enum', width, group, align });
const tx = (id: string, label: string, width: number, group: string): EquipPerfCol => ({ id, label, width, group });
const code = (id: string, label: string, width: number, group: string): EquipPerfCol => ({ id, label, width, group, hidden: true });

/** 작업장 — ERP PP_WRKGRP_INFO.TOP_ORGN_CD. 쿼리가 있는 인쇄·제본만 연다(제판·후가공은 준비 중). */
export type WorkCenter = 'WC20' | 'WC40';
export const WORK_CENTERS: { value: WorkCenter; label: string }[] = [
  { value: 'WC20', label: '인쇄' },
  { value: 'WC40', label: '제본' },
];

/** 인쇄(WC20) — ERP 화면 열 순서 그대로. 코드 컬럼은 기본 숨김. */
export const EQUIP_PERF_COLS: EquipPerfCol[] = [
  // 설비·시간
  { id: 'eqpNm', label: '설비', type: 'enum', width: 120, fixed: 'left', group: '설비' },
  { id: 'wrkDt', label: '작업일자', width: 100, fixed: 'left', group: '설비' },
  en('opNm', '공정', 80, '설비'), code('opCd', '공정코드', 80, '설비'),
  code('companyCd', '회사코드', 80, '설비'), code('plantCd', '공장코드', 80, '설비'), code('plantNm', '공장명', 100, '설비'), code('eqpCd', '설비코드', 110, '설비'),
  tx('startDts', '작업시작시간', 150, '시간'), tx('baseStartDts', '비품시작시간', 150, '시간'), tx('wrkStartDts', '양품시작시간', 150, '시간'), tx('endDts', '작업종료시간', 150, '시간'),
  code('shiftCd', '주야구분코드', 80, '시간'), en('shiftNm', '주야', 70, '시간', 'center'), num('bwrkTm', '근무시간', 80, '시간'),
  // 주문·계획
  tx('orddocNo', '주문번호', 150, '주문'), tx('planNo', '생산계획번호', 150, '주문'), code('planHisSq', '계획이력순번', 80, '주문'),
  { ...num('planSq', '계획순번', 75, '주문'), align: 'center' }, { ...num('planLowSq', '계획하위순번', 90, '주문'), align: 'center' },
  tx('itemCd', '제품코드', 110, '주문'), code('wrkFg', '작업구분코드', 80, '주문'), en('wrkFgNm', '작업구분', 100, '주문'),
  code('deptCd', '부서코드', 80, '주문'), en('deptNm', '부서', 110, '주문'), code('prductgrpCd', '제품군코드', 80, '주문'), en('prductgrpNm', '제품군', 100, '주문'),
  code('partnerCd', '거래처코드', 90, '주문'), en('partnerNm', '거래처', 170, '주문'), tx('spcfcsItemNm', '세부품목명', 260, '주문'),
  code('configCd', '구성코드', 70, '주문'), en('configNm', '구성', 80, '주문'), { ...num('prpcntSq', '대수', 60, '주문'), align: 'center' }, en('pacVr1', '앞/뒤', 65, '주문', 'center'),
  tx('gnrlPrwQt', '도수', 70, '주문'), tx('spclrPrwQt', '별색', 70, '주문'), en('pacVr3', '감리여부', 80, '주문', 'center'), en('grpgYn', '합대여부', 80, '주문', 'center'),
  // 수량·수율
  num('planNetQt', '정미수량(투입)', 110), num('planSpreQt', '여분수량(투입)', 110), num('spreRate', '여분율', 80), num('planQt', '계획수량', 100),
  num('totalWrkQt', '총생산수량', 100), num('totalInputQt', '총투입량', 100),
  num('wrkQt', '생산수량', 100), num('netQt', '생산정미수량', 110), num('spreQt', '생산여분수량', 110), num('badQt', '불량수량', 90), num('irQt', '공회전수', 90),
  num('prdSpreRate', '실적여분율', 90), num('prwYield', '인쇄수율', 80), num('totalYield', '총수율', 80),
  // 시간(분)
  num('startMinute', '작업준비시간(분)', 120, '시간(분)'), num('baseMinute', '비품시간(분)', 100, '시간(분)'), num('goodMinute', '양품시간(분)', 100, '시간(분)'),
  num('wrkMinute', '작업시간(분)', 100, '시간(분)'), num('prdMinute', '생산시간(분)', 100, '시간(분)'),
  num('totalNopTime', '총비가동시간(분)', 120, '시간(분)'), num('nopTime', '정지로스(분)', 100, '시간(분)'), num('nclTime', '비조업로스(분)', 110, '시간(분)'), num('runTime', '가동시간(분)', 100, '시간(분)'),
  // 용지
  code('pprFgCd', '용지구분코드', 80, '용지'), en('pprFgNm', '용지구분', 90, '용지'), tx('mtrilCd', '용지코드', 115, '용지'), tx('mtrilNm', '용지', 180, '용지'),
  en('ppkdNm2', '지종구분', 80, '용지', 'center'), code('ppkdCd', '지종코드', 80, '용지'), en('ppkdNm', '지종', 100, '용지'), code('ppkdLclasCd', '지군코드', 80, '용지'), en('ppkdLclasNm', '지군', 100, '용지'),
  num('bweiQt', '평량', 70, '용지'), num('hrznQt', '용지너비(mm)', 100, '용지'), num('vtclQt', '용지길이(mm)', 100, '용지'), num('netR', '정미R', 80, '용지'), tx('unitCd', '단위', 55, '용지'),
  // 선속·시간·금액
  num('inslQt', '표준선속', 90, '선속'), num('pacVr2', '작업자 설정선속', 110, '선속'), num('timePrdQt', '시간당 총생산량', 120, '선속'), num('wrkLs', '실적선속', 90, '선속'),
  en('itemTypeNm', '완/반제품', 85, '선속', 'center'), num('weightQt', '중량', 90, '선속'),
  num('stdPrdMinute', '표준생산시간(분)', 120, '선속'), num('stdNetMinute', '표준정미시간(분)', 120, '선속'),
  num('wrkUm', '견적기준단가', 100, '금액'), num('wrkAmt', '견적기준단가(생산액)', 140, '금액'),
  code('stdLclasCd', '제품대분류코드', 90, '분류'), en('stdLclasNm', '제품대분류', 100, '분류'), code('stdMlsfcCd', '제품중분류코드', 90, '분류'), en('stdMlsfcNm', '제품중분류', 100, '분류'),
  code('stdSCsfCd', '제품소분류코드', 90, '분류'), en('stdSCsfNm', '제품소분류', 100, '분류'),
  // 가동률
  num('timeRate', '시간가동률', 90, '가동률'), num('perRate', '성능가동률', 90, '가동률'), num('goodRate', '양품가동률', 90, '가동률'), num('oee', 'OEE', 80, '가동률'),
  num('empCnt', '투입인원', 80, '가동률'),
];

/** 제본(WC40, 접지 제외) — ERP "설비별 작업실적조회(제본)" 열 순서. 폐기수량은 정본 산식 그대로(정의 확인 대기). */
export const EQUIP_PERF_COLS_BIND: EquipPerfCol[] = [
  { id: 'eqpNm', label: '설비', type: 'enum', width: 120, fixed: 'left', group: '설비' },
  { id: 'wrkDt', label: '작업일자', width: 100, fixed: 'left', group: '설비' },
  en('opNm', '공정', 80, '설비'), code('opCd', '공정코드', 80, '설비'),
  code('companyCd', '회사코드', 80, '설비'), code('plantCd', '공장코드', 80, '설비'), code('plantNm', '공장명', 100, '설비'), code('eqpCd', '설비코드', 110, '설비'),
  tx('startDts', '작업시작시간', 150, '시간'), tx('baseStartDts', '비품시작시간', 150, '시간'), tx('wrkStartDts', '양품시작시간', 150, '시간'), tx('endDts', '작업종료시간', 150, '시간'),
  code('shiftCd', '주야구분코드', 80, '시간'), en('shiftNm', '주야', 70, '시간', 'center'), num('bwrkTm', '근무시간', 80, '시간'),
  tx('orddocNo', '주문번호', 150, '주문'), tx('planNo', '생산계획번호', 150, '주문'), code('planHisSq', '계획이력순번', 80, '주문'),
  { ...num('planSq', '계획순번', 75, '주문'), align: 'center' }, { ...num('planLowSq', '계획하위순번', 90, '주문'), align: 'center' },
  tx('itemCd', '제품코드', 110, '주문'), code('wrkFg', '작업구분코드', 80, '주문'), en('wrkFgNm', '작업구분', 100, '주문'),
  code('deptCd', '부서코드', 80, '주문'), en('deptNm', '부서', 110, '주문'), code('prductgrpCd', '제품군코드', 80, '주문'), en('prductgrpNm', '제품군', 100, '주문'),
  code('partnerCd', '거래처코드', 90, '주문'), en('partnerNm', '거래처', 170, '주문'), tx('spcfcsItemNm', '세부품목명', 260, '주문'),
  en('pacVr3', '감리여부', 80, '주문', 'center'), tx('specQt', '가로x세로', 100, '주문'), num('totPgs', '페이지수', 80, '주문'), num('fullPrpcntQt', '전체대수', 80, '주문'),
  tx('packUnitDc', '포장단위', 90, '주문'), code('packMthdCd', '포장방법코드', 90, '주문'), en('packMthdNm', '포장방법', 100, '주문'),
  num('befSpreQt', '여분투입량(매)', 110), num('disQt', '폐기수량', 90), num('ordQt', '정미수량(투입)', 110), num('inputQt', '여분수량(투입)', 110),
  num('wrkQt', '생산수량', 100), num('netQt', '생산정미수량', 110), num('spreQt', '생산여분수량', 110), num('badQt', '불량수량', 90),
  num('bbndYield', '제본수율', 80), num('spreRate', '여입율', 80),
  num('startMinute', '작업준비시간(분)', 120, '시간(분)'), num('baseMinute', '비품시간(분)', 100, '시간(분)'), num('goodMinute', '양품시간(분)', 100, '시간(분)'),
  num('wrkMinute', '작업시간(분)', 100, '시간(분)'), num('prdMinute', '생산시간(분)', 100, '시간(분)'),
  num('totalNopTime', '총비가동시간(분)', 120, '시간(분)'), num('nopTime', '정지로스(분)', 100, '시간(분)'), num('nclTime', '비조업로스(분)', 110, '시간(분)'), num('runTime', '가동시간(분)', 100, '시간(분)'),
  tx('unitCd', '단위', 55, '선속'), num('inslQt', '표준선속', 90, '선속'), num('pacVr2', '작업자 설정선속', 110, '선속'),
  num('timePrdQt', '시간당 총생산량', 120, '선속'), num('wrkLs', '실적선속', 90, '선속'),
  num('stdPrdMinute', '표준생산시간(분)', 120, '선속'), num('stdNetMinute', '표준정미시간(분)', 120, '선속'),
  num('wrkUm', '견적기준단가', 100, '금액'), num('wrkAmt', '견적기준단가(생산액)', 140, '금액'),
  code('stdLclasCd', '제품대분류코드', 90, '분류'), en('stdLclasNm', '제품대분류', 100, '분류'), code('stdMlsfcCd', '제품중분류코드', 90, '분류'), en('stdMlsfcNm', '제품중분류', 100, '분류'),
  code('stdSCsfCd', '제품소분류코드', 90, '분류'), en('stdSCsfNm', '제품소분류', 100, '분류'),
  num('timeRate', '시간가동률', 90, '가동률'), num('perRate', '성능가동률', 90, '가동률'), num('goodRate', '양품가동률', 90, '가동률'), num('oee', 'OEE', 80, '가동률'),
  num('empCnt', '투입인원', 80, '가동률'),
];

export const colsFor = (wc: WorkCenter) => (wc === 'WC40' ? EQUIP_PERF_COLS_BIND : EQUIP_PERF_COLS);

/** 작업시작시간은 있고 종료시간이 없으면 지금 그 설비에서 돌고 있는 작업이다. */
export const isRunning = (r: EquipmentPerfRow) => !!r.startDts && !r.endDts;
