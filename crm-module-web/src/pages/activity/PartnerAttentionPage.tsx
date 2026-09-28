import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Popover, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { lookupApi } from '@/api/info.api';
import { attentionApi } from '@/api/activity.api';
import { OPPORTUNITY_REASONS, PLANTS, RISK_REASONS, reasonMeta } from '@/types/attention';
import type { AttentionItem, AttentionReason } from '@/types/attention';
import { T } from '@/theme/designTokens';
import ActivityFormModal from './components/ActivityFormModal';

const { Text } = Typography;

const fmtNum = (v?: number | null) => (v ? `${Math.round(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0');
const fmtEok = (v: number) => (Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : `${Math.round(v / 1e4)}만`);

const MIN_AMT_OPTIONS = [
  { value: 0, label: '전체' },
  { value: 10_000_000, label: '1천만원 이상' },
  { value: 50_000_000, label: '5천만원 이상' },
  { value: 100_000_000, label: '1억원 이상' },
  { value: 500_000_000, label: '5억원 이상' },
];
const DAYS_OPTIONS = [30, 60, 90, 180].map((d) => ({ value: d, label: `${d}일 이상 미접촉` }));

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` }));

/**
 * 관리 필요 거래처 — ERP 매출(올해·작년) + 월매출계획 + 영업활동을 합쳐
 * 이탈·급감·계획누락·장기미접촉을 뽑는다. 손해가 큰 순(작년/올해 중 큰 금액)으로 정렬된다.
 *
 * 기간(시작월~종료월)은 올해와 작년에 똑같이 적용된다. 기본은 연초~당월 —
 * 연중에 12월까지 잡으면 덜 찬 올해를 꽉 찬 작년과 비교하게 돼 전부 '급감'으로 찍힌다.
 */
export default function PartnerAttentionPage() {
  const qc = useQueryClient();
  const thisYear = dayjs().year();
  const thisMonth = dayjs().month() + 1;
  const [year, setYear] = useState(thisYear);
  const [fromMm, setFromMm] = useState(1);
  const [toMm, setToMm] = useState(thisMonth);
  const [minAmt, setMinAmt] = useState(10_000_000);
  const [noContactDays, setNoContactDays] = useState(60);
  const [reason, setReason] = useState<AttentionReason | ''>('');
  const [growthRate, setGrowthRate] = useState(130);
  const [vipTopN, setVipTopN] = useState(20);
  // 사업부문 — 기본은 타라티피에스(1000). 그래픽스·PM 은 별도 조직이라 기본에서 제외.
  const [plantCd, setPlantCd] = useState('1000');
  const [deptCd, setDeptCd] = useState<string>('');
  const [formOpen, setFormOpen] = useState(false);
  const [target, setTarget] = useState<AttentionItem | null>(null);

  const { data: depts } = useQuery({ queryKey: ['departments'], queryFn: () => lookupApi.getDepartments() });
  const deptOptions = useMemo(
    () => (depts ?? []).filter((d) => d.deptCd != null && d.deptNm)
      .map((d) => ({ value: String(d.deptCd), label: d.deptNm })),
    [depts],
  );

  /** 시작월이 종료월보다 뒤면 한 달짜리로 본다(선택 도중 역전 방지). */
  const [lo, hi] = fromMm <= toMm ? [fromMm, toMm] : [toMm, toMm];
  const periodLabel = lo === hi ? `${lo}월` : `${lo}~${hi}월`;
  const setRange = (from: number, to: number) => { setFromMm(from); setToMm(to); };
  /** 연도를 바꾸면 기간도 그 해에 맞게 — 지난 해는 연간, 올해는 연초~당월. */
  const pickYear = (y: number) => { setYear(y); setRange(1, y === thisYear ? thisMonth : 12); };

  const { data, isFetching } = useQuery({
    queryKey: ['partner-attention', year, lo, hi, minAmt, noContactDays, growthRate, vipTopN, reason, deptCd, plantCd],
    queryFn: () => attentionApi.find({
      year, fromMm: lo, toMm: hi, minAmt, noContactDays, growthRate, vipTopN, plantCd,
      reason: reason || undefined, deptCd: deptCd || undefined,
    }),
  });

  const openActivity = (row: AttentionItem) => {
    setTarget(row);
    setFormOpen(true);
  };

  const columns: ColumnsType<AttentionItem> = [
    {
      title: '거래처', key: 'partner', width: 250, fixed: 'left', ellipsis: true,
      render: (_, r) => (
        <span>
          {r.salesRank != null && r.salesRank <= vipTopN && (
            <Tag color="#B45309" style={{ marginInlineEnd: 4 }}>#{r.salesRank}</Tag>
          )}
          {r.partnerNm} <Text type="secondary" style={{ fontSize: 11 }}>{r.partnerCd}</Text>
        </span>
      ),
    },
    {
      title: '사유', key: 'reasons', width: 190,
      render: (_, r) => (
        <Space size={3} wrap>
          {r.reasons.map((x) => {
            const m = reasonMeta(x);
            return <Tooltip key={x} title={m.desc}><Tag color={m.color} style={{ marginInlineEnd: 0 }}>{m.label}</Tag></Tooltip>;
          })}
        </Space>
      ),
    },
    {
      title: '담당부서', key: 'depts', width: 190,
      render: (_, r) => {
        if (!r.depts || r.depts.length === 0) return <Text type="secondary">미지정</Text>;
        const shown = r.depts.slice(0, 2);
        const detail = r.depts.map((d) => `${d.deptNm ?? `CC ${d.ccCd}`} ${fmtEok(d.amt)}`).join(' · ');
        return (
          <Tooltip title={r.deptFromPrevYear ? `작년 기준 — ${detail}` : detail}>
            <Space size={3} wrap>
              {shown.map((d) => (
                <Tag key={`${d.deptCd}-${d.ccCd}`} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                  {d.deptNm ?? `CC ${d.ccCd}`}
                </Tag>
              ))}
              {r.depts.length > 2 && (
                <Text type="secondary" style={{ fontSize: 11 }}>+{r.depts.length - 2}</Text>
              )}
              {r.deptFromPrevYear && <Text type="secondary" style={{ fontSize: 10 }}>작년</Text>}
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: `${year - 1}년 ${periodLabel}`, dataIndex: 'prevAmt', width: 120, align: 'right',
      sorter: (a, b) => a.prevAmt - b.prevAmt,
      render: (v: number) => <Text className="tabular-nums" type="secondary">{fmtNum(v)}</Text>,
    },
    {
      title: `${year}년 ${periodLabel}`, dataIndex: 'curAmt', width: 120, align: 'right',
      sorter: (a, b) => a.curAmt - b.curAmt,
      render: (v: number) => <Text className="tabular-nums">{fmtNum(v)}</Text>,
    },
    {
      title: '증감', dataIndex: 'changeRate', width: 78, align: 'right',
      render: (v: number | null) => (v == null
        ? <Text type="secondary">신규</Text>
        : <Text strong style={{ color: v >= growthRate ? '#15803D' : v >= 100 ? T.ok : v >= 50 ? T.wa : T.er }}>{v}%</Text>),
    },
    {
      title: (
        <Tooltip title="조회 기간과 무관한 실제 마지막 전표일입니다.">
          <span style={{ borderBottom: `1px dotted ${T.t4}` }}>마지막 거래</span>
        </Tooltip>
      ),
      dataIndex: 'lastBillDt', width: 100,
      render: (v: string | null) => (v ? dayjs(v).format('YY-MM-DD') : <Text type="secondary">-</Text>),
    },
    {
      title: '계획', key: 'plan', width: 130,
      render: (_, r) => (r.hasPlan
        ? <span><Text style={{ fontSize: 12 }}>{r.ownerNm ?? '-'}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}> · {fmtEok(r.planAmt)}</Text></span>
        : <Text type="secondary" style={{ fontSize: 12 }}>없음</Text>),
    },
    {
      title: '최근 활동', key: 'act', width: 120,
      render: (_, r) => (r.lastActivityDt
        ? <span><Text style={{ fontSize: 12 }}>{dayjs(r.lastActivityDt).format('YY-MM-DD')}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}> ({r.daysSinceActivity}일)</Text></span>
        : <Text style={{ fontSize: 12, color: T.er }}>기록 없음</Text>),
    },
    {
      title: '', key: 'go', width: 92, fixed: 'right',
      render: (_, r) => (
        <Button size="small" icon={<PlusOutlined />} onClick={() => openActivity(r)}>활동</Button>
      ),
    },
  ];

  return (
    <PageLayout>
      <PageHeader title="관리 필요 거래처" />

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }}
        style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={[12, 8]} align="middle">
          <Col>
            <Select value={year} onChange={pickYear} style={{ width: 100 }}
              options={[thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: `${y}년` }))} />
          </Col>
          <Col>
            <Tooltip title="올해와 작년을 같은 월 구간으로 잘라 비교합니다.">
              <Space.Compact>
                <Select value={lo} onChange={setFromMm} options={MONTH_OPTIONS} style={{ width: 82 }} />
                <Select value={hi} onChange={setToMm} options={MONTH_OPTIONS} style={{ width: 82 }} />
              </Space.Compact>
            </Tooltip>
          </Col>
          <Col>
            <Space size={4}>
              <Button size="small" type={lo === 1 && hi === 12 ? 'primary' : 'default'} onClick={() => setRange(1, 12)}>연간</Button>
              <Button size="small" type={lo === 1 && hi === thisMonth ? 'primary' : 'default'} onClick={() => setRange(1, thisMonth)}>연초~당월</Button>
              <Button size="small" type={lo === thisMonth && hi === thisMonth ? 'primary' : 'default'} onClick={() => setRange(thisMonth, thisMonth)}>당월</Button>
            </Space>
          </Col>
          <Col>
            <Select value={plantCd} onChange={setPlantCd} style={{ width: 170 }} options={PLANTS} />
          </Col>
          <Col>
            <Tooltip title="그 거래처에 매출을 올린 부서 기준입니다. 여러 부서가 담당하면 그중 하나만 맞아도 걸립니다.">
              <Select allowClear showSearch placeholder="담당부서 전체" value={deptCd || undefined}
                options={deptOptions} style={{ width: 160 }} onChange={(v) => setDeptCd(v ?? '')}
                filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
            </Tooltip>
          </Col>
          <Col>
            {/* 매번 바꾸지 않는 판정 기준은 접어 둔다 — 조회조건 줄이 길어지지 않게. */}
            <Popover
              trigger="click"
              placement="bottomLeft"
              title={<Text strong style={{ fontSize: 13 }}>판정 기준</Text>}
              content={(
                <Space direction="vertical" size={10} style={{ width: 240 }}>
                  <div>
                    <Text style={{ fontSize: 12, color: T.t3 }}>최소 매출</Text>
                    <Select value={minAmt} onChange={setMinAmt} options={MIN_AMT_OPTIONS} style={{ width: '100%', marginTop: 4 }} />
                  </div>
                  <div>
                    <Text style={{ fontSize: 12, color: T.t3 }}>미접촉 기준</Text>
                    <Select value={noContactDays} onChange={setNoContactDays} options={DAYS_OPTIONS} style={{ width: '100%', marginTop: 4 }} />
                  </div>
                  <div>
                    <Text style={{ fontSize: 12, color: T.t3 }}>성장 기준</Text>
                    <Select value={growthRate} onChange={setGrowthRate} style={{ width: '100%', marginTop: 4 }}
                      options={[110, 120, 130, 150, 200].map((v) => ({ value: v, label: `작년 대비 ${v}% 이상` }))} />
                  </div>
                  <div>
                    <Text style={{ fontSize: 12, color: T.t3 }}>VIP 범위</Text>
                    <Select value={vipTopN} onChange={setVipTopN} style={{ width: '100%', marginTop: 4 }}
                      options={[10, 20, 30, 50, 100].map((v) => ({ value: v, label: `매출 상위 ${v}곳` }))} />
                  </div>
                </Space>
              )}
            >
              <Button icon={<SettingOutlined />}>기준</Button>
            </Popover>
          </Col>
          <Col>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {MIN_AMT_OPTIONS.find((o) => o.value === minAmt)?.label} · {noContactDays}일 · 성장 {growthRate}% · VIP {vipTopN}
            </Text>
          </Col>
          <Col style={{ marginLeft: 'auto' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {isFetching ? '집계 중…' : `${data?.total ?? 0}곳`}
            </Text>
          </Col>
        </Row>
      </Card>

      <div style={{ marginBottom: 6 }}>
        <Text strong style={{ fontSize: 12, color: T.t3 }}>주의</Text>
      </div>
      <Row gutter={[12, 12]} style={{ marginBottom: 14 }}>
        {RISK_REASONS.map((r) => {
          const active = reason === r.value;
          return (
            <Col xs={12} md={6} key={r.value}>
              <Card
                variant="borderless" hoverable
                onClick={() => setReason(active ? '' : r.value)}
                styles={{ body: { padding: '14px 18px' } }}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${active ? r.color : T.border2}`,
                  background: active ? '#fff' : undefined,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color }} />
                  <Text style={{ fontSize: 12, color: T.t3 }}>{r.label}</Text>
                </div>
                <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 700, color: r.color, lineHeight: 1.3 }}>
                  {data?.byReason?.[r.value] ?? 0}
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.t3 }}> 곳</span>
                </div>
                <Text style={{ fontSize: 11, color: T.t4 }}>{r.desc}</Text>
              </Card>
            </Col>
          );
        })}
      </Row>

      <div style={{ marginBottom: 6 }}>
        <Text strong style={{ fontSize: 12, color: T.t3 }}>기회</Text>
      </div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {OPPORTUNITY_REASONS.map((r) => {
          const active = reason === r.value;
          return (
            <Col xs={12} md={8} key={r.value}>
              <Card
                variant="borderless" hoverable
                onClick={() => setReason(active ? '' : r.value)}
                styles={{ body: { padding: '14px 18px' } }}
                style={{
                  borderRadius: 12,
                  border: `1px solid ${active ? r.color : T.border2}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color }} />
                  <Text style={{ fontSize: 12, color: T.t3 }}>{r.label}</Text>
                </div>
                <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 700, color: r.color, lineHeight: 1.3 }}>
                  {data?.byReason?.[r.value] ?? 0}
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.t3 }}> 곳</span>
                </div>
                <Text style={{ fontSize: 11, color: T.t4 }}>{r.desc}</Text>
              </Card>
            </Col>
          );
        })}
      </Row>

      {reason && (
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Tag color={reasonMeta(reason).color} closable onClose={() => setReason('')}
            style={{ marginInlineEnd: 0 }}>
            {reasonMeta(reason).label}
          </Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>{data?.total ?? 0}곳</Text>
        </div>
      )}

      {data && !data.erpAvailable && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message="ERP 매출을 불러오지 못했습니다." description={data.erpMessage ?? undefined} />
      )}

      <Table<AttentionItem>
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isFetching}
        rowKey="partnerCd"
        size="small"
        bordered
        scroll={{ x: 1360, y: 'calc(100vh - 460px)' }}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], size: 'small' }}
        locale={{ emptyText: '조건에 해당하는 거래처가 없습니다.' }}
      />

      <ActivityFormModal
        open={formOpen}
        editing={null}
        defaultPartner={target ? { partnerCd: target.partnerCd, partnerNm: target.partnerNm } : undefined}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['partner-attention'] });
          qc.invalidateQueries({ queryKey: ['activity-list'] });
          qc.invalidateQueries({ queryKey: ['activity-calendar'] });
        }}
      />
    </PageLayout>
  );
}
