import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Calendar, Card, Col, Drawer, Empty, Popconfirm, Row, Segmented, Select,
  Space, Tag, Tooltip, Typography, message,
} from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { DeleteOutlined, EditOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { salesPlanApi } from '@/api/salesPlan.api';
import { activityApi } from '@/api/activity.api';
import { ACTIVITY_TYPES, typeMeta } from '@/types/activity';
import { dealApi } from '@/api/deal.api';
import { stageMeta } from '@/types/deal';
import type { ActivityItem, CalendarDay } from '@/types/activity';
import { T } from '@/theme/designTokens';
import ActivityFormModal from './components/ActivityFormModal';

const { Text } = Typography;
const fmtNum = (v?: number | null) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '');

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
/** 일요일 빨강 · 토요일 파랑 — 그 외는 본문색 */
const dowColor = (i: number) => (i === 0 ? '#DC2626' : i === 6 ? '#2563EB' : T.t2);

const DEAL_C = { fg: '#1E40AF', bg: '#EFF6FF', bd: '#BFDBFE' };

/** 한 달/하루의 집계 — 유형별 건수와 ★◆ */
type Bucket = { total: number; byType: Record<string, number>; followUps: number; dealCloses: number };
const emptyBucket = (): Bucket => ({ total: 0, byType: {}, followUps: 0, dealCloses: 0 });

/** 유형 구성비를 가로 막대 하나로 — 숫자만 있을 때보다 성격이 한눈에 보인다. */
function TypeBar({ byType, total, height = 4 }: { byType: Record<string, number>; total: number; height?: number }) {
  if (total <= 0) return null;
  return (
    <div style={{ display: 'flex', height, borderRadius: height, overflow: 'hidden', background: T.border3 }}>
      {ACTIVITY_TYPES.filter((t) => byType[t.value]).map((t) => (
        <div key={t.value} style={{ width: `${(byType[t.value] / total) * 100}%`, background: t.color }} />
      ))}
    </div>
  );
}

/** 상단 요약 타일 */
function StatTile({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 116, padding: '10px 14px',
      border: `1px solid ${T.border2}`, borderRadius: 10, background: T.surface,
    }}>
      <div style={{ fontSize: 11, color: T.t3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</span>
        <span style={{ fontSize: 11, color: T.t4 }}>{sub ?? '건'}</span>
      </div>
    </div>
  );
}

/**
 * 영업활동 캘린더.
 *
 * 월 보기는 날짜 칸에 그날 활동을 제목까지 직접 얹고(개수 점만 찍으면 눌러보기 전엔 뭔지 모른다),
 * 년 보기는 달마다 건수·유형 구성을 보여준 뒤 누르면 그 달로 들어간다.
 * 날짜를 누르면 오른쪽 서랍에 그날 일정이 열리고 거기서 등록·수정·삭제한다.
 */
export default function ActivityCalendarPage() {
  const qc = useQueryClient();
  const [cursor, setCursor] = useState<Dayjs>(dayjs());
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [salesEmpId, setSalesEmpId] = useState<string>('');
  const [selected, setSelected] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityItem | null>(null);

  const year = cursor.year();
  const month = cursor.month() + 1;
  const today = dayjs();

  const { data: users } = useQuery({ queryKey: ['sales-plan-users', undefined], queryFn: () => salesPlanApi.getUsers() });
  const userOptions = useMemo(() => (users ?? []).map((u) => ({ value: u.id, label: u.name })), [users]);

  /* ---------------------------------------------------------------- 월 보기 */

  const { data: days } = useQuery({
    queryKey: ['activity-calendar', year, month, salesEmpId],
    queryFn: () => activityApi.calendar(year, month, salesEmpId || undefined),
    enabled: mode === 'month',
  });
  const byDate = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    (days ?? []).forEach((d) => m.set(d.date, d));
    return m;
  }, [days]);

  const monthStart = cursor.startOf('month').format('YYYY-MM-DD');
  const monthEnd = cursor.endOf('month').format('YYYY-MM-DD');
  const { data: monthItems } = useQuery({
    queryKey: ['activity-list', monthStart, monthEnd, salesEmpId],
    queryFn: () => activityApi.list({ from: monthStart, to: monthEnd, salesEmpId: salesEmpId || undefined }),
  });
  /** 날짜 칸에 제목까지 얹으려면 집계가 아니라 원본 목록이 필요하다. */
  const itemsByDate = useMemo(() => {
    const m = new Map<string, ActivityItem[]>();
    (monthItems ?? []).forEach((i) => {
      const arr = m.get(i.activityDt) ?? [];
      arr.push(i);
      m.set(i.activityDt, arr);
    });
    return m;
  }, [monthItems]);

  const dayItems = useMemo(
    () => (monthItems ?? []).filter((i) => i.activityDt === selected),
    [monthItems, selected],
  );

  // ★ 배지는 nextActionDt 기준이라 그날 '활동'이 없어도 찍힌다.
  // 서랍에서도 같이 보여줘야 "★는 있는데 내용이 없다"는 혼란이 없다.
  const { data: monthFollowUps } = useQuery({
    queryKey: ['activity-followups', monthStart, monthEnd, salesEmpId],
    queryFn: () => activityApi.followUps(monthStart, monthEnd, salesEmpId || undefined),
  });
  const dayFollowUps = useMemo(
    () => (monthFollowUps ?? []).filter((i) => i.nextActionDt === selected),
    [monthFollowUps, selected],
  );

  // ◆ 배지와 짝이 되는 목록 — 그날 마감 예정인 영업기회.
  const { data: pipeline } = useQuery({
    queryKey: ['deal-pipeline', salesEmpId, ''],
    queryFn: () => dealApi.pipeline({ salesEmpId: salesEmpId || undefined }),
  });
  const dayDeals = useMemo(
    () => (pipeline?.items ?? []).filter((d) => d.expectedCloseDt === selected && stageMeta(d.stage).open),
    [pipeline, selected],
  );

  const monthSummary = useMemo(() => {
    const b = emptyBucket();
    (days ?? []).forEach((d) => {
      b.total += d.total;
      b.followUps += d.followUps;
      b.dealCloses += d.dealCloses;
      Object.entries(d.byType).forEach(([k, v]) => { b.byType[k] = (b.byType[k] ?? 0) + (v as number); });
    });
    return b;
  }, [days]);

  /* ---------------------------------------------------------------- 년 보기 */

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const { data: yearItems } = useQuery({
    queryKey: ['activity-list', yearStart, yearEnd, salesEmpId],
    queryFn: () => activityApi.list({ from: yearStart, to: yearEnd, salesEmpId: salesEmpId || undefined }),
    enabled: mode === 'year',
  });
  const { data: yearFollowUps } = useQuery({
    queryKey: ['activity-followups', yearStart, yearEnd, salesEmpId],
    queryFn: () => activityApi.followUps(yearStart, yearEnd, salesEmpId || undefined),
    enabled: mode === 'year',
  });

  /** 월별 집계 — 년 보기 칸을 채운다. 월 단위 API 가 따로 없어 목록을 클라이언트에서 묶는다. */
  const byMonth = useMemo(() => {
    const arr = Array.from({ length: 12 }, emptyBucket);
    (yearItems ?? []).forEach((i) => {
      const m = dayjs(i.activityDt).month();
      arr[m].total += 1;
      arr[m].byType[i.activityType] = (arr[m].byType[i.activityType] ?? 0) + 1;
    });
    (yearFollowUps ?? []).forEach((i) => {
      if (i.nextActionDt) arr[dayjs(i.nextActionDt).month()].followUps += 1;
    });
    (pipeline?.items ?? []).forEach((d) => {
      if (!d.expectedCloseDt || !stageMeta(d.stage).open) return;
      const dt = dayjs(d.expectedCloseDt);
      if (dt.year() === year) arr[dt.month()].dealCloses += 1;
    });
    return arr;
  }, [yearItems, yearFollowUps, pipeline, year]);

  const yearSummary = useMemo(
    () => byMonth.reduce((acc, b) => {
      acc.total += b.total; acc.followUps += b.followUps; acc.dealCloses += b.dealCloses;
      Object.entries(b.byType).forEach(([k, v]) => { acc.byType[k] = (acc.byType[k] ?? 0) + v; });
      return acc;
    }, emptyBucket()),
    [byMonth],
  );

  const summary = mode === 'year' ? yearSummary : monthSummary;
  const busiestMonth = useMemo(() => {
    let best = -1;
    byMonth.forEach((b, i) => { if (best < 0 || b.total > byMonth[best].total) best = i; });
    return best >= 0 && byMonth[best].total > 0 ? best : null;
  }, [byMonth]);

  /* ------------------------------------------------------------------ 공통 */

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['activity-calendar'] });
    qc.invalidateQueries({ queryKey: ['activity-list'] });
    qc.invalidateQueries({ queryKey: ['activity-followups'] });
    qc.invalidateQueries({ queryKey: ['today-follow-ups'] });
  };

  const handleDelete = async (id: number) => {
    try {
      await activityApi.remove(id);
      message.success('삭제되었습니다.');
      refresh();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const step = (delta: number) => setCursor(cursor.add(delta, mode === 'year' ? 'year' : 'month'));
  const goToday = () => { setCursor(dayjs()); setMode('month'); };
  const openMonth = (m: number) => { setCursor(cursor.month(m)); setMode('month'); };

  /* -------------------------------------------------------------- 날짜 한 칸 */

  const dateCell = (value: Dayjs) => {
    const key = value.format('YYYY-MM-DD');
    const inMonth = value.month() === cursor.month();
    const d = byDate.get(key);
    const items = itemsByDate.get(key) ?? [];
    const isToday = value.isSame(today, 'day');
    const isSelected = key === selected;
    const dow = value.day();

    return (
      <div
        className="cal-cell"
        style={{
          minHeight: 96, padding: '4px 5px 6px', borderRadius: 8,
          background: isSelected ? T.primary50 : 'transparent',
          border: `1px solid ${isSelected ? T.primary100 : 'transparent'}`,
          opacity: inMonth ? 1 : 0.35,
          transition: 'background 0.12s',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 20, height: 20, borderRadius: 10, padding: '0 5px',
            fontSize: 12, fontWeight: isToday ? 700 : 500,
            color: isToday ? '#fff' : dowColor(dow),
            background: isToday ? T.primary : 'transparent',
          }}>
            {value.date()}
          </span>
          {d && d.followUps > 0 && (
            <Tooltip title={`팔로업 예정 ${d.followUps}건`}>
              <span style={{ fontSize: 10, color: T.wa, fontWeight: 700 }}>★{d.followUps}</span>
            </Tooltip>
          )}
          {d && d.dealCloses > 0 && (
            <Tooltip title={`영업기회 마감 ${d.dealCloses}건`}>
              <span style={{ fontSize: 10, color: DEAL_C.fg, fontWeight: 700 }}>◆{d.dealCloses}</span>
            </Tooltip>
          )}
          {items.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 10, color: T.t4 }}>{items.length}</span>
          )}
        </div>

        {items.slice(0, 3).map((it) => {
          const meta = typeMeta(it.activityType);
          return (
            <div key={it.activityId}
              title={`${meta.label} · ${it.title}${it.partnerNm ? ` · ${it.partnerNm}` : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2,
                paddingLeft: 5, borderLeft: `3px solid ${meta.color}`,
                fontSize: 11, lineHeight: '16px', color: T.t2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
              {it.partnerNm ? `${it.partnerNm} · ${it.title}` : it.title}
            </div>
          );
        })}
        {items.length > 3 && (
          <div style={{ fontSize: 10, color: T.t4, paddingLeft: 8 }}>+{items.length - 3}건 더</div>
        )}
      </div>
    );
  };

  /* --------------------------------------------------------------- 월 한 칸 */

  const monthCell = (value: Dayjs) => {
    const m = value.month();
    const b = byMonth[m];
    const isNow = value.isSame(today, 'month');
    const isBusiest = busiestMonth === m;

    return (
      <div
        className="cal-cell"
        onClick={() => openMonth(m)}
        style={{
          minHeight: 92, padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
          border: `1px solid ${isNow ? T.primary100 : T.border2}`,
          background: isNow ? T.primary50 : T.surface,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isNow ? T.primary : T.t1 }}>{m + 1}월</span>
          {isNow && <Tag color={T.primary} style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '16px' }}>이번 달</Tag>}
          {isBusiest && !isNow && <Tag style={{ marginInlineEnd: 0, fontSize: 10, lineHeight: '16px' }}>최다</Tag>}
        </div>

        {b.total === 0 && b.followUps === 0 && b.dealCloses === 0 ? (
          <div style={{ fontSize: 11, color: T.t4, marginTop: 10 }}>활동 없음</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: T.t1, lineHeight: 1.2 }}>{b.total}</span>
              <span style={{ fontSize: 11, color: T.t4 }}>건</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {b.followUps > 0 && <span style={{ fontSize: 11, color: T.wa, fontWeight: 700 }}>★{b.followUps}</span>}
                {b.dealCloses > 0 && <span style={{ fontSize: 11, color: DEAL_C.fg, fontWeight: 700 }}>◆{b.dealCloses}</span>}
              </span>
            </div>
            <div style={{ marginTop: 6 }}><TypeBar byType={b.byType} total={b.total} /></div>
          </>
        )}
      </div>
    );
  };

  /* ----------------------------------------------------------------- 렌더링 */

  return (
    <PageLayout>
      <PageHeader title="영업활동 캘린더" />

      {/* 달력 칸 hover — styled-components 를 안 쓰므로 여기서 최소한만 얹는다. */}
      <style>{`
        .cal-cell:hover { background: ${T.border3} !important; }
        .ant-picker-calendar .ant-picker-cell .ant-picker-cell-inner { padding: 0 !important; }
        .ant-picker-calendar-date-today::before { display: none !important; }
      `}</style>

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }}
        style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={[12, 10]} align="middle">
          <Col>
            <Select allowClear showSearch placeholder="담당자 전체" value={salesEmpId || undefined}
              options={userOptions} style={{ width: 180 }} onChange={(v) => setSalesEmpId(v ?? '')}
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Col>
          <Col flex="auto">
            <Space size={10} wrap>
              {ACTIVITY_TYPES.map((t) => (
                <span key={t.value} style={{ fontSize: 12, color: T.t3, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: t.color }} />{t.label}
                </span>
              ))}
              <span style={{ fontSize: 12, color: T.wa }}>★ 팔로업 예정</span>
              <span style={{ fontSize: 12, color: DEAL_C.fg }}>◆ 영업기회 마감</span>
            </Space>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => { setEditing(null); setSelected(dayjs().format('YYYY-MM-DD')); setFormOpen(true); }}>
              활동 등록
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 기간 요약 — 달력만 보면 총량이 안 잡힌다. */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatTile label={mode === 'year' ? `${year}년 활동` : `${month}월 활동`} value={summary.total} color={T.t1} />
        <StatTile label="팔로업 예정" value={summary.followUps} color={T.wa} />
        <StatTile label="영업기회 마감" value={summary.dealCloses} color={DEAL_C.fg} />
        <div style={{
          flex: 2, minWidth: 220, padding: '10px 14px',
          border: `1px solid ${T.border2}`, borderRadius: 10, background: T.surface,
        }}>
          <div style={{ fontSize: 11, color: T.t3, marginBottom: 6 }}>유형 구성</div>
          {summary.total > 0 ? (
            <>
              <TypeBar byType={summary.byType} total={summary.total} height={6} />
              <Space size={8} wrap style={{ marginTop: 6 }}>
                {ACTIVITY_TYPES.filter((t) => summary.byType[t.value]).map((t) => (
                  <span key={t.value} style={{ fontSize: 11, color: T.t3 }}>
                    <span style={{
                      display: 'inline-block', width: 7, height: 7, borderRadius: 4,
                      background: t.color, marginRight: 4,
                    }} />
                    {t.label} {summary.byType[t.value]}
                  </span>
                ))}
              </Space>
            </>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>기록된 활동이 없습니다.</Text>
          )}
        </div>
      </div>

      <Card variant="borderless" styles={{ body: { padding: '4px 10px 10px' } }}
        style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Calendar
          value={cursor}
          mode={mode}
          onPanelChange={(v, m) => { setCursor(v); setMode(m); }}
          onSelect={(v, info) => {
            if (info.source === 'date') {
              setCursor(v);
              setSelected(v.format('YYYY-MM-DD'));
            }
          }}
          headerRender={() => (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 4px 12px', borderBottom: `1px solid ${T.border2}`, marginBottom: 6,
            }}>
              <Space.Compact>
                <Button icon={<LeftOutlined />} onClick={() => step(-1)} />
                <Button icon={<RightOutlined />} onClick={() => step(1)} />
              </Space.Compact>
              <span style={{ fontSize: 17, fontWeight: 700, color: T.t1 }}>
                {mode === 'year' ? `${year}년` : `${year}년 ${month}월`}
              </span>
              <Button size="small" onClick={goToday}>오늘</Button>
              <Segmented
                style={{ marginLeft: 'auto' }}
                value={mode}
                onChange={(v) => setMode(v as 'month' | 'year')}
                options={[{ label: '월', value: 'month' }, { label: '년', value: 'year' }]}
              />
            </div>
          )}
          fullCellRender={(value, info) => (info.type === 'date' ? dateCell(value) : monthCell(value))}
        />
        {mode === 'month' && (
          <div style={{ display: 'flex', gap: 0, marginTop: 2 }}>
            {/* antd 기본 요일 머리는 그대로 두고, 주말 색 안내만 아래에 덧붙인다. */}
            <Text type="secondary" style={{ fontSize: 11 }}>
              날짜를 누르면 그날 일정이 오른쪽에 열립니다.
            </Text>
          </div>
        )}
      </Card>

      <Drawer
        title={selected ? (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{dayjs(selected).format('M월 D일')}</div>
            <div style={{ fontSize: 12, color: dowColor(dayjs(selected).day()), fontWeight: 500 }}>
              {dayjs(selected).format('YYYY')}년 {DOW[dayjs(selected).day()]}요일
              {dayjs(selected).isSame(today, 'day') && <span style={{ color: T.primary }}> · 오늘</span>}
            </div>
          </div>
        ) : '영업활동'}
        open={selected != null && !formOpen}
        onClose={() => setSelected(null)}
        width={460}
        styles={{ body: { background: T.bg, padding: 16 } }}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />}
            onClick={() => { setEditing(null); setFormOpen(true); }}>
            등록
          </Button>
        }
      >
        {dayFollowUps.length > 0 && (
          <Section label="예정된 일" count={dayFollowUps.length} color={T.wa} mark="★">
            {dayFollowUps.map((it) => (
              <RailCard key={`f-${it.activityId}`} color={T.wa} tint={T.waBg}
                onEdit={() => { setEditing(it); setFormOpen(true); }}>
                <Text strong style={{ fontSize: 13 }}>{it.nextAction ?? '팔로업 예정'}</Text>
                <Meta>{it.empNm}{it.partnerNm ? ` · ${it.partnerNm}` : ''}</Meta>
                <Meta dim>{dayjs(it.activityDt).format('M/D')} “{it.title}” 에서 잡은 일정</Meta>
              </RailCard>
            ))}
          </Section>
        )}

        {dayDeals.length > 0 && (
          <Section label="마감 예정 영업기회" count={dayDeals.length} color={DEAL_C.fg} mark="◆">
            {dayDeals.map((d) => (
              <RailCard key={`d-${d.dealId}`} color={DEAL_C.fg} tint={DEAL_C.bg}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tag color={stageMeta(d.stage).color} style={{ marginInlineEnd: 0 }}>{stageMeta(d.stage).label}</Tag>
                  <Text strong style={{ fontSize: 13 }}>{d.title}</Text>
                </div>
                <Meta>{d.partnerNm ?? '거래처 없음'} · {d.empNm}</Meta>
                <Meta>{fmtNum(d.expectedAmt)}원 · 확률 {d.probability}%</Meta>
              </RailCard>
            ))}
          </Section>
        )}

        {dayItems.length > 0 ? (
          <Section label="등록된 활동" count={dayItems.length} color={T.t3}>
            {dayItems.map((it) => {
              const meta = typeMeta(it.activityType);
              return (
                <RailCard key={it.activityId} color={meta.color}
                  onEdit={() => { setEditing(it); setFormOpen(true); }}
                  onDelete={() => handleDelete(it.activityId)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.label}</Tag>
                    <Text strong style={{ fontSize: 13 }}>{it.title}</Text>
                  </div>
                  <Meta>{it.empNm}{it.deptNm ? ` · ${it.deptNm}` : ''}{it.partnerNm ? ` · ${it.partnerNm}` : ''}</Meta>
                  {it.content && (
                    <div style={{ fontSize: 12, color: T.t2, marginTop: 6, whiteSpace: 'pre-wrap' }}>{it.content}</div>
                  )}
                  {it.amount != null && <Meta>금액 {fmtNum(it.amount)}원</Meta>}
                  {it.nextActionDt && (
                    <div style={{
                      fontSize: 12, color: T.wa, marginTop: 8, paddingTop: 8,
                      borderTop: `1px dashed ${T.border1}`,
                    }}>
                      ★ {dayjs(it.nextActionDt).format('M/D')} {it.nextAction ?? '팔로업 예정'}
                    </div>
                  )}
                </RailCard>
              );
            })}
          </Section>
        ) : (
          dayFollowUps.length === 0 && dayDeals.length === 0 ? (
            <div style={{
              background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 12, padding: '28px 16px',
            }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="이 날짜에 등록된 활동이 없습니다.">
                <Button type="primary" icon={<PlusOutlined />}
                  onClick={() => { setEditing(null); setFormOpen(true); }}>
                  활동 등록
                </Button>
              </Empty>
            </div>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>이 날 등록된 활동은 없습니다.</Text>
          )
        )}
      </Drawer>

      <ActivityFormModal
        open={formOpen}
        editing={editing}
        defaultDate={selected ?? undefined}
        onClose={() => setFormOpen(false)}
        onSaved={refresh}
      />
    </PageLayout>
  );
}

/* ------------------------------------------------------------- 서랍 구성요소 */

function Section({ label, count, color, mark, children }: {
  label: string; count: number; color: string; mark?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {mark && <span style={{ color, fontSize: 12, fontWeight: 700 }}>{mark}</span>}
        <Text strong style={{ fontSize: 12, color }}>{label}</Text>
        <span style={{
          fontSize: 11, color: T.t3, background: T.border3,
          borderRadius: 8, padding: '0 6px', lineHeight: '16px',
        }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

/** 왼쪽에 색 띠를 둔 카드 — 유형/성격을 색으로 먼저 읽게 한다. */
function RailCard({ color, tint, onEdit, onDelete, children }: {
  color: string; tint?: string; onEdit?: () => void; onDelete?: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      position: 'relative',
      background: tint ?? T.surface,
      border: `1px solid ${T.border2}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: '10px 12px',
      marginBottom: 8,
    }}>
      {(onEdit || onDelete) && (
        <Space size={0} style={{ position: 'absolute', top: 6, right: 6 }}>
          {onEdit && <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} />}
          {onDelete && (
            <Popconfirm title="이 활동을 삭제할까요?" onConfirm={onDelete} okText="삭제" cancelText="취소">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      )}
      <div style={{ paddingRight: onEdit || onDelete ? 56 : 0 }}>{children}</div>
    </div>
  );
}

function Meta({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <div style={{ fontSize: 12, color: dim ? T.t4 : T.t3, marginTop: 4 }}>{children}</div>;
}
