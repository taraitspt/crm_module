import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Skeleton, Row, Col, theme } from 'antd';
import {
  RiseOutlined, CalendarOutlined, ReloadOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/ko';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '@/components/layout';
import AnimatedNumber from '@/components/common/AnimatedNumber';
import { T } from '@/theme/designTokens';
import { getDashboardSummary, getSalesTrend, getIntegratedDashboard, getDashboardAnnualGoal } from '@/api/stats.api';
import type { DashboardSummaryDto, IntegratedDashboardDto, SalesTrendDto } from '@/types/stats';

dayjs.extend(relativeTime);
dayjs.locale('ko');

const { useToken } = theme;

// 브랜드 색상
const NAVY  = '#003957';   // T.navy
const TEAL  = '#0096A2';   // T.primary
const RED   = '#EF4444';

const DashboardPartTooltip = ({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ payload?: { achievedAmount?: number; goalAmount?: number; remainingAmount?: number; achievementRate?: number } }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  const achieved = row?.achievedAmount ?? 0;
  const goal = row?.goalAmount ?? 0;
  const remaining = row?.remainingAmount ?? 0;
  const rate = row?.achievementRate ?? 0;
  const amount = (value: number) => `${Math.round(value).toLocaleString()}원`;
  const valueStyle: React.CSSProperties = { textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' };

  return (
    <div style={{ minWidth: 230, padding: '14px 16px', borderRadius: 10, background: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.14)', fontSize: 13 }}>
      <div style={{ marginBottom: 12, color: NAVY, fontSize: 15, fontWeight: 800 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr auto', alignItems: 'center', gap: '10px 12px' }}>
        <span>달성금액</span>
        <span style={{ ...valueStyle, color: TEAL }}>{amount(achieved)}</span>
        <span style={{ padding: '2px 9px', borderRadius: 5, background: TEAL, color: '#fff', fontWeight: 800 }}>{rate.toFixed(1)}%</span>
        <span>목표금액</span>
        <span style={{ ...valueStyle, color: NAVY }}>{amount(goal)}</span>
        <span />
        <span style={{ color: '#94a3b8' }}>잔여금액</span>
        <span style={{ ...valueStyle, color: '#94a3b8' }}>{amount(remaining)}</span>
        <span />
      </div>
    </div>
  );
};


const DashboardPage: React.FC = () => {
  const { token } = useToken();
  const navigate  = useNavigate();

  const [integrated,   setIntegrated]   = useState<IntegratedDashboardDto | null>(null);
  // 연간 전체목표 카드용. 무거운 통합대시보드(풀-이어 매출집계)를 또 돌리는 대신 goal_mst 만 읽는 경량 API로 조회.
  const [annualGoalAmt, setAnnualGoalAmt] = useState<number>(0);
  // 매출현황 차트 전용 — 부서 스코프 무시(전체 파트). 요약 카드는 스코프된 integrated 사용.
  const [integratedAll, setIntegratedAll] = useState<IntegratedDashboardDto | null>(null);
  const [trendData,    setTrendData]    = useState<SalesTrendDto | null>(null);
  const [summary,      setSummary]      = useState<DashboardSummaryDto | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [chartLoading, setChartLoading] = useState(false);

  const now   = dayjs();
  const year  = now.year();
  const month = now.month() + 1;

  const loadData = useCallback(async () => {
    setLoading(true);
    setChartLoading(true);
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = dayjs(monthStart).endOf('month').format('YYYY-MM-DD');
    // 첫 화면에 필요한 요약을 먼저 완료한다. 전체부서 매출현황 집계는 이후 순차 로딩해
    // 무거운 통계 쿼리 3개가 동시에 DB를 점유하지 않도록 한다.
    const [intRes, annualRes, trendRes, sumRes] = await Promise.allSettled([
      getIntegratedDashboard(monthStart, monthEnd),                              // 요약 카드용(부서 스코프)
      getDashboardAnnualGoal(year),                                              // 전체목표 카드용 — goal_mst만(경량). 무거운 통합대시보드 재호출 대체
      getSalesTrend(),
      getDashboardSummary(),
    ]);
    const scoped = intRes.status === 'fulfilled' && intRes.value.data.success ? intRes.value.data.data : null;
    if (scoped) setIntegrated(scoped);
    if (annualRes.status === 'fulfilled' && annualRes.value.data.success) setAnnualGoalAmt(annualRes.value.data.data ?? 0);
    if (trendRes.status === 'fulfilled' && trendRes.value.data.success) setTrendData(trendRes.value.data.data);
    if (sumRes.status  === 'fulfilled' && sumRes.value.data.success)   setSummary(sumRes.value.data.data);
    setLoading(false);

    // 전체 권한 사용자는 부서스코프 응답 == 전체부서 응답 (서버 scopeAll 플래그) →
    // 같은 무거운 집계를 한 번 더 돌리는 전체부서 호출을 생략하고 재사용한다.
    if (scoped?.scopeAll) {
      setIntegratedAll(scoped);
      setChartLoading(false);
      return;
    }
    try {
      const intAllRes = await getIntegratedDashboard(
        monthStart, monthEnd, undefined, undefined, undefined, true,
      );
      if (intAllRes.data.success) setIntegratedAll(intAllRes.data.data);
      else {
        setIntegratedAll(null);
        console.warn('[대시보드] 전체부서 실적 조회 실패(success=false) → 매출현황이 월별 추이로 대체됩니다.');
      }
    } catch (e) {
      // ★조용히 삼키면 화면엔 월별 추이가 그럴듯하게 떠서 실패를 아무도 모른다.
      //   (실제로 이 집계가 20초 걸리던 시절, 파트별 차트 대신 월별이 계속 보이던 원인)
      setIntegratedAll(null);
      console.warn('[대시보드] 전체부서 실적 조회 실패 → 매출현황이 월별 추이로 대체됩니다.', e);
    } finally {
      setChartLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── 데이터 파생 ──────────────────────────────────────────────
  const hqRow   = integrated?.rows.find((r) => r.rowType === 'hq');
  // 매출현황 차트 = 전체 파트(integratedAll), 달성률(당월실적/당월목표) 높은 순 정렬.
  const partRows = (integratedAll?.rows.filter(
    (r) => r.rowType === 'item' && (r.monthActual > 0 || r.monthGoal > 0)
  ) ?? [])
    .slice()
    .sort((a, b) => {
      const ra = a.monthGoal > 0 ? a.monthActual / a.monthGoal : -1;
      const rb = b.monthGoal > 0 ? b.monthActual / b.monthGoal : -1;
      return rb - ra;
    });

  const monthlySalesArr = trendData?.monthlySales ?? [];
  const lastMonthAmt    = monthlySalesArr.length > 0
    ? monthlySalesArr[monthlySalesArr.length - 1].amount : 0;

  const monthActual      = hqRow?.monthActual      ?? lastMonthAmt;
  const cumulativeActual = hqRow?.cumulativeActual ?? 0;

  // 누적달성률: 화면에 표시된 누적실적 / 전체목표로 직접 계산 (백엔드 FIND_IN_SET 필터값과 불일치 방지)
  const cumulativeGoalAmt = annualGoalAmt;
  const derivedCumulativeRate = cumulativeGoalAmt > 0
    ? Math.round(cumulativeActual * 1000 / cumulativeGoalAmt) / 10
    : 0;

  // 차트: 파트별 있으면 파트별, 없으면 월별 폴백
  const usePartChart = partRows.length > 0;

  const chartData = usePartChart
    ? partRows.map((r) => ({
        name: r.orgName,
        당월실적:    Math.max(0, r.monthActual ?? 0),
        당월목표:    Math.max(0, r.monthGoal ?? 0),
        전년동월실적: Math.max(0, r.prevYearActual ?? 0),
        achievedAmount: Math.max(0, r.monthActual ?? 0),
        goalAmount: Math.max(0, r.monthGoal ?? 0),
        remainingAmount: Math.max(0, (r.monthGoal ?? 0) - (r.monthActual ?? 0)),
        achievementRate: r.monthGoal > 0 ? Math.round((r.monthActual ?? 0) * 1000 / r.monthGoal) / 10 : 0,
      }))
    : monthlySalesArr.map((item, idx) => ({
        name:  `${item.month.substring(5)}월`,
        매출액: item.amount ?? 0,
        추세:  trendData?.trendLine[idx]?.amount ?? 0,
      }));

  return (
    <PageLayout>

      {/* ── 1. 페이지 타이틀 ─────────────────────────────── */}
      <div
        className="sm-rise"
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          {/* 프리텐다드 black 30pt 네이비 */}
          <div style={{ fontSize: 30, fontWeight: 900, color: NAVY, lineHeight: 1.15, fontFamily: token.fontFamily }}>
            대시보드
          </div>
          {/* 프리텐다드 semibold 11pt 그레이 #a0a0a0 */}
          <div style={{ fontSize: 11, fontWeight: 600, color: '#a0a0a0', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <CalendarOutlined />
            {dayjs().format('YYYY년 M월 D일 dddd')} 기준
          </div>
        </div>

        {/* 프리텐다드 medium 12pt 네이비 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button
            size="middle"
            icon={<ReloadOutlined />}
            loading={loading || chartLoading}
            onClick={loadData}
            style={{ fontWeight: 500, fontSize: 12, color: NAVY, borderColor: '#d1d5db' }}
          >
            새로고침
          </Button>
          <Button
            type="primary"
            size="middle"
            icon={<RiseOutlined />}
            onClick={() => navigate('/stats/team-forecast')}
            style={{ fontWeight: 700, fontSize: 12, background: NAVY, borderColor: NAVY }}
          >
            실적 분석 리포트
          </Button>
        </div>
      </div>

      {/* ── 2. KPI 행 ────────────────────────────────────── */}
      {loading ? (
        <div className="sm-rise" style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', marginBottom: 24 }}>
          <Skeleton active paragraph={{ rows: 1 }} />
        </div>
      ) : (
        <div className="sm-rise" style={{ display: 'flex', gap: 12, marginBottom: 24, animationDelay: '60ms', fontFamily: T.font }}>

          {/* ── Group 1: 네이비 박스 (당월실적 / 당월목표 / 당월달성률) ── */}
          <div style={{
            background: NAVY, borderRadius: 14, padding: '20px 20px',
            display: 'flex', alignItems: 'stretch', gap: 12, flex: 3.5,
            boxShadow: '0 8px 24px rgba(0,57,87,0.30), 0 2px 6px rgba(0,57,87,0.15)',
          }}>
            {/* 당월실적 — 네이비 배경 위에 그냥 흰 숫자 */}
            <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 8px' }}>
              <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>당월실적</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 40, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
                  <AnimatedNumber value={monthActual} duration={900} />
                </span>
                <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.65)', marginLeft: 6 }}>원</span>
              </div>
            </div>

            {/* 당월목표 — 네이비 안에 흰색 카드 (입체) */}
            <div style={{
              background: '#fff', borderRadius: 10, padding: '16px 18px',
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>당월목표</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
                  <AnimatedNumber value={hqRow?.monthGoal ?? 0} />
                </span>
                <span style={{ fontSize: 14, color: NAVY, marginLeft: 4 }}>원</span>
              </div>
            </div>

            {/* 당월달성률 — 네이비 안에 흰색 카드 (입체) */}
            <div style={{
              background: '#fff', borderRadius: 10, padding: '16px 18px',
              flex: 0.75, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>당월달성률</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 900, color: NAVY, lineHeight: 1 }}>
                  {(hqRow?.monthRate ?? 0).toFixed(1)}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginLeft: 3 }}>%</span>
              </div>
            </div>
          </div>

          {/* ── Group 2: 흰색 박스 (누적실적 / 전체목표 / 누적달성률) ── */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: '20px 20px',
            display: 'flex', alignItems: 'stretch', gap: 12, flex: 3.5,
            boxShadow: '0 6px 20px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
            border: '1px solid #e5e7eb',
          }}>
            {/* 누적실적 — 흰박스 배경 위에 그냥 네이비 숫자 */}
            <div style={{ flex: 1.6, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 8px' }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>누적실적</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 38, fontWeight: 900, color: NAVY, lineHeight: 1 }}>
                  <AnimatedNumber value={cumulativeActual} duration={900} />
                </span>
                <span style={{ fontSize: 16, color: NAVY, marginLeft: 5 }}>원</span>
              </div>
            </div>

            {/* 전체목표 — 그림자 흰카드 (입체 3D) */}
            <div style={{
              background: '#fff', borderRadius: 10, padding: '16px 18px',
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
              border: '1px solid #f0f0f0',
            }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{year}년 전체목표</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
                  <AnimatedNumber value={cumulativeGoalAmt} />
                </span>
                <span style={{ fontSize: 14, color: NAVY, marginLeft: 4 }}>원</span>
              </div>
            </div>

            {/* 누적달성률 — 그림자 흰카드 (입체 3D) */}
            <div style={{
              background: '#fff', borderRadius: 10, padding: '16px 18px',
              flex: 0.75, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
              border: '1px solid #f0f0f0',
            }}>
              <div style={{ color: NAVY, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>누적달성률</div>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 900, color: NAVY, lineHeight: 1 }}>
                  {derivedCumulativeRate.toFixed(1)}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginLeft: 3 }}>%</span>
              </div>
            </div>
          </div>

          {/* ── Group 3: 미처리건수 — 흰박스 + 빨간 글씨 (입체) ── */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: '20px 20px',
            flex: 0.6, display: 'flex', flexDirection: 'column', justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ color: RED, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>미처리건수</div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <span className="tabular-nums" style={{ fontSize: 25, fontWeight: 900, color: RED, lineHeight: 1 }}>
                {summary?.unprocessedSalesCount ?? 0}
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: RED, marginLeft: 4 }}>건</span>
            </div>
          </div>

        </div>
      )}

      {/* ── 3. 차트 ─────────────────────────────────────── */}
      <Row gutter={[20, 20]} className="sm-rise" style={{ animationDelay: '120ms', alignItems: 'stretch' }}>

        {/* 매출현황 차트 */}
        <Col xs={24} style={{ display: 'flex', flexDirection: 'column' }}>
          <Card
            className="sm-card"
            title={
              <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>매출현황</span>
            }
            extra={
              <Button
                type="link"
                size="small"
                style={{ fontWeight: 600, color: TEAL, padding: 0 }}
                onClick={() => navigate('/stats/team-forecast')}
              >
                상세분석
              </Button>
            }
            variant="borderless"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 12, boxShadow: token.boxShadow, border: '1px solid #e5e7eb' }}
            styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 24px 16px' } }}
          >
            {chartLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : (
              <div style={{ flex: 1, minHeight: 420, marginTop: 4 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 0 }} barGap={2} barCategoryGap="32%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 500 }}
                      dy={8}
                      interval={0}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={56}
                      domain={[0, (dataMax: number) => {
                        if (!isFinite(dataMax) || dataMax <= 0) return 10000000;
                        const mag = Math.pow(10, Math.floor(Math.log10(dataMax * 1.3)));
                        return Math.ceil((dataMax * 1.3) / mag) * mag;
                      }]}
                      tick={{ fill: '#6B7280', fontSize: 11 }}
                      tickFormatter={(v: number) => {
                        if (v === 0) return '0';
                        if (Math.abs(v) >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
                        if (Math.abs(v) >= 10000)     return `${Math.round(v / 10000)}만`;
                        return v.toLocaleString();
                      }}
                    />
                    {usePartChart ? (
                      <Tooltip content={<DashboardPartTooltip />} />
                    ) : (
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12 }}
                        formatter={(v: number) => [v.toLocaleString() + '원']}
                      />
                    )}
                    <Legend
                      verticalAlign="top"
                      align="right"
                      wrapperStyle={{ fontSize: 12, paddingBottom: 16 }}
                      iconType="square"
                      iconSize={10}
                    />
                    {usePartChart ? (
                      <>
                        <Bar dataKey="당월실적"    fill={TEAL}    radius={[3, 3, 0, 0]} />
                        <Bar dataKey="당월목표"    fill={NAVY}    radius={[3, 3, 0, 0]} />
                        <Bar dataKey="전년동월실적" fill="#CBD5E1" radius={[3, 3, 0, 0]} />
                      </>
                    ) : (
                      <>
                        <Bar dataKey="매출액" fill={TEAL} radius={[3, 3, 0, 0]} />
                        <Bar dataKey="추세"   fill={NAVY} radius={[3, 3, 0, 0]} />
                      </>
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>

      </Row>

      <style>{`
        .tabular-nums { font-variant-numeric: tabular-nums; }

        .sm-rise {
          animation: smRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes smRise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }

        .sm-card {
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .sm-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px -4px rgba(0,57,87,0.12) !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .sm-rise { animation: none; }
          .sm-card { transition: none; }
        }
      `}</style>
    </PageLayout>
  );
};


export default DashboardPage;
