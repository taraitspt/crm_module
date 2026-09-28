import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, DatePicker, Row, Segmented, Select, Space, Table, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { salesPlanApi } from '@/api/salesPlan.api';
import { activityApi } from '@/api/activity.api';
import type { BoardRow } from '@/types/activity';
import { T } from '@/theme/designTokens';

const { Text } = Typography;
const { RangePicker } = DatePicker;

/** 건수에 따른 셀 농도 — 0건은 비우고, 많을수록 진하게. */
const cellBg = (n: number, max: number) => {
  if (!n) return undefined;
  const ratio = max > 0 ? n / max : 0;
  const alpha = 0.14 + ratio * 0.66;
  return `rgba(0, 150, 162, ${alpha.toFixed(2)})`;
};

/**
 * 일자별 영업현황 보드 — 행은 담당자(또는 거래처), 열은 날짜.
 * 셀은 그날 활동 건수. 누가 어느 날 움직였는지 한 판에 보이는 게 목적이다.
 */
export default function ActivityBoardPage() {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [groupBy, setGroupBy] = useState<'EMP' | 'PARTNER'>('EMP');
  const [salesEmpId, setSalesEmpId] = useState<string>('');

  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');

  const { data: users } = useQuery({ queryKey: ['sales-plan-users', undefined], queryFn: () => salesPlanApi.getUsers() });
  const userOptions = useMemo(() => (users ?? []).map((u) => ({ value: u.id, label: u.name })), [users]);

  const { data, isLoading } = useQuery({
    queryKey: ['activity-board', from, to, groupBy, salesEmpId],
    queryFn: () => activityApi.board(from, to, groupBy, salesEmpId || undefined),
  });

  const maxCell = useMemo(() => {
    let m = 0;
    (data?.rows ?? []).forEach((r) => Object.values(r.counts).forEach((n) => { if (n > m) m = n; }));
    return m;
  }, [data]);

  const columns: ColumnsType<BoardRow> = useMemo(() => [
    {
      title: groupBy === 'EMP' ? '담당자' : '거래처',
      key: 'label',
      width: 170,
      fixed: 'left',
      render: (_, r) => (
        <div style={{ lineHeight: 1.3 }}>
          <div style={{ fontSize: 13, color: T.t1 }}>{r.rowLabel}</div>
          {r.subLabel && <div style={{ fontSize: 11, color: T.t4 }}>{r.subLabel}</div>}
        </div>
      ),
    },
    ...(data?.dates ?? []).map((d) => {
      const day = dayjs(d);
      const weekend = day.day() === 0 || day.day() === 6;
      return {
        title: (
          <div style={{ lineHeight: 1.2, color: weekend ? T.t4 : undefined }}>
            <div style={{ fontSize: 11 }}>{day.format('M/D')}</div>
            <div style={{ fontSize: 10, color: T.t4 }}>{day.format('dd')}</div>
          </div>
        ),
        key: d,
        width: 42,
        align: 'center' as const,
        onCell: (r: BoardRow) => ({
          style: {
            background: cellBg(r.counts[d] ?? 0, maxCell) ?? (weekend ? '#FAFAFA' : undefined),
            padding: 0,
          },
        }),
        render: (_: unknown, r: BoardRow) => {
          const n = r.counts[d] ?? 0;
          if (!n) return <span style={{ color: T.border1 }}>·</span>;
          const strong = maxCell > 0 && n / maxCell > 0.55;
          return (
            <Tooltip title={`${day.format('M월 D일')} ${r.rowLabel} ${n}건`}>
              <span style={{ fontSize: 12, fontWeight: 600, color: strong ? '#fff' : T.t1 }}>{n}</span>
            </Tooltip>
          );
        },
      };
    }),
    {
      title: '합계',
      key: 'total',
      width: 64,
      fixed: 'right',
      align: 'right',
      render: (_, r) => <Text strong className="tabular-nums" style={{ color: '#1e40af' }}>{r.total}</Text>,
    },
  ], [data, groupBy, maxCell]);

  const preset = (label: string, f: dayjs.Dayjs, t: dayjs.Dayjs) => (
    <Button size="small" onClick={() => setRange([f, t])}>{label}</Button>
  );

  return (
    <PageLayout>
      <PageHeader title="일자별 영업현황" />

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }}
        style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={[12, 8]} align="middle">
          <Col>
            <RangePicker value={range} allowClear={false} style={{ width: 250 }}
              onChange={(v) => { if (v && v[0] && v[1]) setRange([v[0], v[1]]); }} />
          </Col>
          <Col>
            <Space size={4}>
              {preset('이번달', dayjs().startOf('month'), dayjs().endOf('month'))}
              {preset('지난달', dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month'))}
              {preset('최근 2주', dayjs().subtract(13, 'day'), dayjs())}
            </Space>
          </Col>
          <Col>
            <Segmented value={groupBy} onChange={(v) => setGroupBy(v as 'EMP' | 'PARTNER')}
              options={[{ label: '담당자별', value: 'EMP' }, { label: '거래처별', value: 'PARTNER' }]} />
          </Col>
          <Col>
            <Select allowClear showSearch placeholder="담당자 전체" value={salesEmpId || undefined}
              options={userOptions} style={{ width: 160 }} onChange={(v) => setSalesEmpId(v ?? '')}
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Col>
          <Col style={{ marginLeft: 'auto' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              총 {data?.total ?? 0}건 · 최대 {maxCell}건/일
            </Text>
          </Col>
        </Row>
      </Card>

      <Table<BoardRow>
        columns={columns}
        dataSource={data?.rows ?? []}
        loading={isLoading}
        rowKey="rowKey"
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 234 + (data?.dates.length ?? 0) * 42, y: 'calc(100vh - 300px)' }}
        locale={{ emptyText: '해당 기간에 등록된 영업활동이 없습니다.' }}
        summary={() => {
          if (!data || data.rows.length === 0) return null;
          let idx = 1;
          return (
            <Table.Summary fixed>
              <Table.Summary.Row className="sales-status-summary">
                <Table.Summary.Cell index={0}><Text strong>일별 합계</Text></Table.Summary.Cell>
                {data.dates.map((d) => (
                  <Table.Summary.Cell key={d} index={idx++} align="center">
                    <Text className="tabular-nums" style={{ fontSize: 12 }}>{data.dateTotals[d] ?? 0}</Text>
                  </Table.Summary.Cell>
                ))}
                <Table.Summary.Cell index={idx++} align="right">
                  <Text strong className="tabular-nums" style={{ color: '#1e40af' }}>{data.total}</Text>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />
      <style>{`.sales-status-summary > td { background: #eef2f7 !important; }`}</style>
    </PageLayout>
  );
}
