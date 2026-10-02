import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Spin } from 'antd';
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { getWorkOrder } from '@/api/production.api';
import { fmtNum, type PlanMode, type PlanRow } from '@/types/planRegister';
import { ymd } from '@/types/orderProgress';
import logoUrl from '@/assets/brand/tara-logo.png';

const s = (v: PlanRow[string]) => (v == null ? '' : String(v));
const n = (v: PlanRow[string], d = 0) => fmtNum(v, d);

/**
 * 작업지시서 — 주문상세 순번(라인) 하나당 한 장(사용자 결정 2026-10-02). GROW 작업지시서 양식 그대로, 인쇄(Ctrl+P / 버튼)용 단독 화면.
 * 라우트 /production/work-order/:orderNo/:sq?mode=order|request. sq 가 없으면(옛 링크) 주문 전체 라인을 한 장에 이어 그린다.
 * mode 가 없으면 서버가 문서번호 머리글자(PQE = 의뢰)로 판단한다. 의뢰면 "주문번호/주문명" 라벨이 "의뢰번호/의뢰명"으로 바뀐다.
 * 머리: 주문번호·주문명·거래처·영업담당(전화). 라인: 사이즈·제작부수·제본형태·포장방법·포장수량·납기요청일.
 * 주의사항: 영업 = 그 라인의 특이사항(SD_ORDER_DTL.RMK_TXT, 화면의 공정별특이사항), 없으면 주문 비고. 생산 = 계획 비고(PP_PLAN_MST.RMK_TXT).
 * 세부품목의 인쇄 계획 행(구성·대수·원고형태·설비·색도·용지·재단규격·면수·터잡기·매수·판수).
 * 용지현황: 용지별 정미/여분 매수 합과 합계 연수(FULL_QT 합) — ERP 값을 더할 뿐 매↔연 환산은 하지 않는다.
 */
const WorkOrderPage: React.FC = () => {
  const { orderNo = '', sq } = useParams();
  const [search] = useSearchParams();
  const modeParam = search.get('mode');
  const mode: PlanMode | null = modeParam === 'order' || modeParam === 'request' ? modeParam : null;
  const q = useQuery({ queryKey: ['work-order', orderNo, sq ?? '', mode ?? ''], queryFn: () => getWorkOrder(orderNo, sq, mode), enabled: !!orderNo, staleTime: 60_000 });
  const data = q.data?.data?.data;
  // 서버가 head.request(boolean)로 방향을 알려준다 — Map 이라 타입은 느슨하게 받는다.
  const headRequest = (data?.head as Record<string, unknown> | undefined)?.request;
  const isRequest = headRequest === true || (headRequest == null && mode === 'request');
  const doc = isRequest ? '의뢰' : '주문';

  const lines = useMemo(() => [...(data?.lines ?? [])].sort((a, b) => Number(a.orddocSq) - Number(b.orddocSq)), [data]);
  const printBySq = useMemo(() => {
    const m = new Map<string, PlanRow[]>();
    for (const r of data?.printRows ?? []) { const k = s(r.orddocSq); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
    return m;
  }, [data]);
  const paper = useMemo(() => {
    const m = new Map<string, { name: string; net: number; spare: number; ream: number; unit: string }>();
    for (const r of data?.printRows ?? []) {
      if (!r.mtrilNm) continue;
      const k = s(r.mtrilCd) || s(r.mtrilNm);
      const p = m.get(k) ?? { name: s(r.mtrilNm), net: 0, spare: 0, ream: 0, unit: s(r.stdUnitCd) };
      p.net += Number(r.netPpcntQt ?? 0); p.spare += Number(r.sprePpcntQt ?? 0); p.ream += Number(r.fullQt ?? 0);
      m.set(k, p);
    }
    return Array.from(m.values());
  }, [data]);

  // 폰에서는 760px 양식을 화면 폭에 맞춰 축소해 보여준다(인쇄에는 영향 없음 — @media print 에서 zoom 을 푼다).
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 16) / 760));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const head = data?.head ?? {};
  const tel = s(head.bizrsptTelNo);
  // 영업주의사항 — 라인 한 장이면 그 라인 특이사항, 전체면 라인별 특이사항을 순번과 함께. 없으면 주문 비고.
  const salesRemark = lines.length === 1
    ? (s(lines[0].rmkTxt) || s(head.salesRmkTxt))
    : (lines.filter((l) => l.rmkTxt).map((l) => `#${s(l.orddocSq)} ${s(l.rmkTxt)}`).join('\n') || s(head.salesRmkTxt));

  return (
    <div className="wo-root">
      <div className="wo-toolbar no-print">
        <Button icon={<ArrowLeftOutlined />} onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}>뒤로</Button>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>작업지시서 {orderNo}{sq ? ` #${sq}` : ''}</span>
        {/* 폰 폭에서는 한 줄로 자른다 */}
        <span style={{ flex: 1, minWidth: 0, color: '#666', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lines.length === 1 ? s(lines[0].spcfcsItemNm) : ''}</span>
        <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()} disabled={!data}>인쇄</Button>
      </div>

      {q.isLoading && <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>}
      {q.error && <Alert type="error" showIcon style={{ margin: 16 }} message={`작업지시서를 가져오지 못했습니다. ${(q.error as Error).message}`} />}

      {data && (
        <div className="wo-page" style={scale < 1 ? { zoom: scale } : undefined}>
          {/* 머리 */}
          <table className="wo-head">
            <tbody>
              <tr><td colSpan={4} className="wo-title">작 업 지 시 서</td></tr>
              <tr>
                <td rowSpan={2} className="wo-logo"><img src={logoUrl} alt="타라티피에스" /></td>
                <th>{doc}번호</th><td colSpan={2}>{s(head.orddocNo)}</td>
              </tr>
              <tr><th>{doc}명</th><td colSpan={2}>{s(head.orddocNm)}</td></tr>
              <tr>
                <td colSpan={4} className="wo-party">
                  <div><span>거래처</span>: {s(head.partnerNm)}</div>
                  <div><span>영업 담당</span>: {s(head.bizrsptEmpnoNm)}{tel ? `( ${tel} )` : ''}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* 라인 — 사이즈·부수·제본·포장·납기 */}
          <table className="wo-lines">
            <tbody>
              {lines.map((l) => (
                <React.Fragment key={s(l.orddocSq)}>
                  <tr><td colSpan={6} className="wo-line-title">{s(l.spcfcsItemNm) || s(l.itemNm)}</td></tr>
                  <tr className="wo-line-head">
                    <th>사이즈( 가로, 세로, 높이)</th><th>제작부수</th><th>제본형태</th><th>포장방법</th><th>포장수량</th><th>납기요청일</th>
                  </tr>
                  <tr className="wo-line-val">
                    {/* 양식대로 "가로, 세로, 높이" — 높이가 0/없음이면 빈칸(의뢰는 0 으로 들어온다) */}
                    <td>{[l.hrznQt, l.vtclQt, l.hghQt].map((v) => (v == null || Number(v) === 0 ? '' : n(v))).join(', ')}</td>
                    <td>{n(l.ordQt)}</td>
                    <td>{s(l.bbndInfoNm)}</td>
                    <td>{s(l.packMthdNm)}</td>
                    <td>{s(l.packUnitDc)}</td>
                    <td>{ymd(l.dlvshDts)}</td>
                  </tr>
                </React.Fragment>
              ))}
              {lines.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>{doc} 라인이 없습니다</td></tr>}
            </tbody>
          </table>

          {/* 주의사항 */}
          <div className="wo-notice">※ 주의사항과 항목에 명기된 사항을 100% 숙지 후 작업에 임하시길 바랍니다.</div>
          <table className="wo-remark">
            <tbody>
              <tr><th>영업주의사항</th></tr>
              <tr><td>{salesRemark}</td></tr>
              <tr><th>생산주의사항</th></tr>
              <tr><td>{s(head.planRmkTxt)}</td></tr>
            </tbody>
          </table>

          {/* 세부품목별 인쇄 계획 */}
          {!head.planNo && <div className="wo-noplan">생산계획이 아직 작성되지 않은 {doc}입니다 — 인쇄 계획·용지현황은 계획 작성 후 나옵니다.</div>}
          {lines.map((l) => {
            const rows = printBySq.get(s(l.orddocSq)) ?? [];
            if (!rows.length) return null;
            return (
              <table className="wo-item" key={`p-${s(l.orddocSq)}`}>
                {/* 열 폭 — 용지명·설비·터잡기는 글자가 길어 넓게, 숫자 칸은 좁게 */}
                <colgroup>
                  {[44, 32, 48, 64, 40, 140, 56, 32, 52, 52, 52, 56, 32].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <tbody>
                  <tr className="wo-item-title">
                    <td colSpan={7}><span className="lbl">세부품목명 :</span> {s(l.spcfcsItemNm) || s(l.itemNm)}</td>
                    <td colSpan={3}><span className="lbl">A급 견본 :</span> {n(l.custSampCps2)}</td>
                    <td colSpan={3}><span className="lbl">가제본견본 :</span> {n(l.custSampCps)}</td>
                  </tr>
                  <tr className="wo-item-head">
                    <th>구성</th><th>대수</th><th>원고형태</th><th>설비</th><th>색도</th><th>용지명</th><th>재단규격</th>
                    <th>면수</th><th>터잡기</th><th>정미매수</th><th>여분매수</th><th>합계(매수)</th><th>판수</th>
                  </tr>
                  {rows.map((r, i) => (
                    <React.Fragment key={`${s(r.keyValNm)}-${i}`}>
                      <tr className="wo-item-val">
                        <td>{s(r.configNm)}</td>
                        <td>{n(r.prpcntSq)}</td>
                        <td>{s(r.plmkNm)}</td>
                        <td>{s(r.eqpNm)}</td>
                        <td>{`${n(r.gnrlPrwBefQt)} / ${n(r.gnrlPrwAftrQt)}`}</td>
                        <td className="wrap">{s(r.mtrilNm)}</td>
                        <td>{s(r.dtlSizeDc)}</td>
                        <td>{n(r.pgs)}</td>
                        <td>{s(r.dtlDc)}</td>
                        <td>{n(r.netPpcntQt)}</td>
                        <td>{n(r.sprePpcntQt)}</td>
                        <td>{n(r.fullPpcntQt)}</td>
                        <td>{n(r.plteCntSumQt)}</td>
                      </tr>
                      {/* 별색(앞/뒤)·비고 — 양식의 연한 줄. 값이 없어도 줄은 둔다. */}
                      <tr className="wo-item-sub">
                        <td colSpan={13}>{[s(r.itemCdFront), s(r.itemCdBack), s(r.rmkTxt)].join(' / ')}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            );
          })}

          {/* 용지현황 */}
          {paper.length > 0 && (
            <table className="wo-paper">
              <tbody>
                <tr><td colSpan={5} className="wo-paper-title">용지현황</td></tr>
                <tr className="wo-paper-head"><th>용지명</th><th>정미매수</th><th>여분매수</th><th>합계연수</th><th>단위</th></tr>
                {paper.map((p) => (
                  <tr key={p.name} className="wo-paper-val">
                    <td style={{ textAlign: 'left' }}>{p.name}</td>
                    <td>{p.net.toLocaleString('ko-KR')}</td>
                    <td>{p.spare.toLocaleString('ko-KR')}</td>
                    <td>{p.ream.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</td>
                    <td>{p.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <style>{`
        .wo-root { min-height: 100vh; background: #d9d9d9; font-family: 'Malgun Gothic', 'Pretendard', sans-serif; color: #111; }
        .wo-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: #fff; border-bottom: 1px solid #ccc; }
        .wo-page { width: 760px; margin: 16px auto; background: #fff; padding: 24px 28px; box-shadow: 0 2px 8px rgba(0,0,0,.15); font-size: 11px; }
        .wo-page table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .wo-page th, .wo-page td { border: 1px solid #333; padding: 4px 6px; text-align: center; vertical-align: middle; word-break: break-all; }
        .wo-root .wo-page th, .wo-root .wo-page td { color: #111; }
        .wo-lines .wo-line-head th:first-child { white-space: nowrap; }
        .wo-head .wo-title { font-size: 22px; font-weight: 700; letter-spacing: 10px; padding: 8px; }
        .wo-head .wo-logo { width: 150px; padding: 6px; }
        .wo-head .wo-logo img { height: 34px; }
        .wo-head th { width: 70px; background: #fafafa; }
        .wo-head td { text-align: center; }
        .wo-head .wo-party { text-align: left; padding: 6px 28px; }
        .wo-head .wo-party span { display: inline-block; width: 70px; }
        .wo-lines { margin-top: -1px; }
        .wo-lines .wo-line-title { text-align: left; font-weight: 600; padding: 6px 8px; }
        .wo-lines .wo-line-head th { background: #fff; font-weight: 600; width: 16.6%; }
        .wo-lines .wo-line-val td { height: 24px; }
        .wo-notice { color: #e00; font-weight: 700; text-align: center; padding: 6px; border: 1px solid #333; border-top: none; border-bottom: none; }
        .wo-remark th { background: #fff; font-weight: 600; }
        .wo-remark td { height: 30px; text-align: left; white-space: pre-wrap; vertical-align: top; }
        .wo-noplan { margin: 14px 0; padding: 10px; border: 1px dashed #999; color: #666; text-align: center; }
        .wo-item { margin-top: 14px; font-size: 10px; }
        .wo-item .wo-item-title td { background: #d9d9d9; text-align: left; font-weight: 600; padding: 4px 8px; }
        .wo-item .wo-item-title .lbl { color: #333; margin-right: 4px; }
        .wo-item .wo-item-head th { background: #00b0f0; color: #fff; font-weight: 600; font-size: 9px; padding: 3px 2px; }
        .wo-item .wo-item-val td { background: #fff; padding: 3px 2px; }
        .wo-item .wo-item-val td.wrap { text-align: left; }
        .wo-item .wo-item-sub td { background: #dff3f9; height: 16px; text-align: left; color: #333; }
        .wo-paper { margin-top: 18px; }
        .wo-paper .wo-paper-title { background: #d9d9d9; font-weight: 600; text-align: left; padding: 4px 8px; width: 160px; border-right: none; }
        .wo-paper .wo-paper-head th { background: #fff; font-weight: 600; }
        .wo-paper .wo-paper-val td { height: 22px; }
        .wo-paper tr:first-child td { border-bottom: none; }
        @media print {
          .no-print { display: none !important; }
          .wo-root { background: #fff; }
          .wo-page { width: auto; margin: 0; padding: 0; box-shadow: none; zoom: 1 !important; }
          .wo-item, .wo-paper { page-break-inside: avoid; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </div>
  );
};

export default WorkOrderPage;
