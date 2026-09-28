import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, DatePicker, Input, Popconfirm, Row, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { salesPlanApi } from '@/api/salesPlan.api';
import { activityApi } from '@/api/activity.api';
import { ACTIVITY_TYPES, typeMeta } from '@/types/activity';
import type { ActivityItem } from '@/types/activity';
import { T } from '@/theme/designTokens';
import ActivityFormModal from './components/ActivityFormModal';

const { Text } = Typography;
const { RangePicker } = DatePicker;
const fmtNum = (v?: number | null) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '-');

/** 영업활동 이력 — 기간·담당자·유형·키워드로 찾고 등록·수정·삭제한다. */
export default function ActivityListPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().startOf('month'), dayjs().endOf('month')]);
  const [salesEmpId, setSalesEmpId] = useState('');
  const [activityType, setActivityType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityItem | null>(null);

  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');

  const { data: users } = useQuery({ queryKey: ['sales-plan-users', undefined], queryFn: () => salesPlanApi.getUsers() });
  const userOptions = useMemo(() => (users ?? []).map((u) => ({ value: u.id, label: u.name })), [users]);

  const { data, isLoading } = useQuery({
    queryKey: ['activity-list', from, to, salesEmpId, activityType, keyword],
    queryFn: () => activityApi.list({
      from, to,
      salesEmpId: salesEmpId || undefined,
      activityType: activityType || undefined,
      keyword: keyword || undefined,
    }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['activity-list'] });
    qc.invalidateQueries({ queryKey: ['activity-calendar'] });
    qc.invalidateQueries({ queryKey: ['activity-board'] });
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

  const columns: ColumnsType<ActivityItem> = [
    { title: '일자', dataIndex: 'activityDt', width: 100, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    {
      title: '유형', dataIndex: 'activityType', width: 76,
      render: (v: string) => { const m = typeMeta(v); return <Tag color={m.color} style={{ marginInlineEnd: 0 }}>{m.label}</Tag>; },
    },
    { title: '담당자', dataIndex: 'empNm', width: 90 },
    { title: '부서', dataIndex: 'deptNm', width: 110, render: (v) => v ?? '-' },
    {
      title: '거래처', key: 'partner', width: 190, ellipsis: true,
      render: (_, r) => (r.partnerNm
        ? <span>{r.partnerNm} <Text type="secondary" style={{ fontSize: 11 }}>{r.partnerCd}</Text></span>
        : <Text type="secondary">-</Text>),
    },
    { title: '제목', dataIndex: 'title', ellipsis: true },
    { title: '금액', dataIndex: 'amount', width: 110, align: 'right', render: (v) => <span className="tabular-nums">{fmtNum(v)}</span> },
    {
      title: '다음 액션', key: 'next', width: 190, ellipsis: true,
      render: (_, r) => (r.nextActionDt
        ? <Text style={{ fontSize: 12, color: T.wa }}>{dayjs(r.nextActionDt).format('M/D')} {r.nextAction ?? ''}</Text>
        : <Text type="secondary">-</Text>),
    },
    {
      title: '', key: 'act', width: 72, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); setFormOpen(true); }} />
          <Popconfirm title="이 활동을 삭제할까요?" onConfirm={() => handleDelete(r.activityId)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageLayout>
      <PageHeader title="영업활동 이력" />

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }}
        style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={[12, 8]} align="middle">
          <Col>
            <RangePicker value={range} allowClear={false} style={{ width: 250 }}
              onChange={(v) => { if (v && v[0] && v[1]) setRange([v[0], v[1]]); }} />
          </Col>
          <Col>
            <Select allowClear showSearch placeholder="담당자 전체" value={salesEmpId || undefined}
              options={userOptions} style={{ width: 150 }} onChange={(v) => setSalesEmpId(v ?? '')}
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Col>
          <Col>
            <Select allowClear placeholder="유형 전체" value={activityType || undefined} style={{ width: 120 }}
              options={ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              onChange={(v) => setActivityType(v ?? '')} />
          </Col>
          <Col>
            <Input.Search allowClear placeholder="제목 · 거래처명" style={{ width: 220 }} onSearch={setKeyword} />
          </Col>
          <Col style={{ marginLeft: 'auto' }}>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>{data?.length ?? 0}건</Text>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setFormOpen(true); }}>
                활동 등록
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Table<ActivityItem>
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        rowKey="activityId"
        size="small"
        bordered
        scroll={{ x: 1250, y: 'calc(100vh - 320px)' }}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], size: 'small' }}
        expandable={{
          rowExpandable: (r) => !!r.content,
          expandedRowRender: (r) => (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: T.t2, padding: '4px 8px' }}>{r.content}</div>
          ),
        }}
        locale={{ emptyText: '해당 조건의 영업활동이 없습니다.' }}
      />

      <ActivityFormModal open={formOpen} editing={editing} onClose={() => setFormOpen(false)} onSaved={refresh} />
    </PageLayout>
  );
}
