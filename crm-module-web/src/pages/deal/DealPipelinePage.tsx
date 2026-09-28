import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Col, Empty, Input, Modal, Popconfirm, Row, Segmented, Select, Space, Table, Tooltip, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { salesPlanApi } from '@/api/salesPlan.api';
import { dealApi } from '@/api/deal.api';
import { STAGES, stageMeta } from '@/types/deal';
import type { DealItem, DealStage } from '@/types/deal';
import { T } from '@/theme/designTokens';
import DealFormModal from './components/DealFormModal';
import ActivityFormModal from '@/pages/activity/components/ActivityFormModal';

const { Text } = Typography;

const fmtNum = (v?: number | null) => (v ? `${Math.round(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0');
const fmtShort = (v: number) => (Math.abs(v) >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : `${Math.round(v / 1e4)}만`);

/**
 * 영업기회 파이프라인.
 * 칸반은 단계별 카드, 목록은 표. 카드의 단계 셀렉트로 옮기면 확률이 단계 기본값으로 갱신된다.
 * (드래그 대신 셀렉트를 쓴 건 별도 라이브러리 없이 확실히 동작시키기 위해서다)
 */
export default function DealPipelinePage() {
  const qc = useQueryClient();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [salesEmpId, setSalesEmpId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DealItem | null>(null);
  const [lostTarget, setLostTarget] = useState<DealItem | null>(null);
  const [lostReason, setLostReason] = useState('');
  // 딜에서 바로 활동을 남긴다 — 거래처와 딜이 채워진 채로 활동 모달이 열린다.
  const [actTarget, setActTarget] = useState<DealItem | null>(null);
  const [actOpen, setActOpen] = useState(false);
  const openActivity = (d: DealItem) => {
    setActTarget(d);
    setActOpen(true);
  };

  const { data: users } = useQuery({ queryKey: ['sales-plan-users', undefined], queryFn: () => salesPlanApi.getUsers() });
  const userOptions = useMemo(() => (users ?? []).map((u) => ({ value: u.id, label: u.name })), [users]);

  const { data, isFetching } = useQuery({
    queryKey: ['deal-pipeline', salesEmpId, keyword],
    queryFn: () => dealApi.pipeline({ salesEmpId: salesEmpId || undefined, keyword: keyword || undefined }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['deal-pipeline'] });

  const moveStage = async (d: DealItem, next: DealStage) => {
    if (next === d.stage) return;
    if (next === 'LOST') {
      setLostTarget(d);
      setLostReason('');
      return;
    }
    try {
      await dealApi.changeStage(d.dealId, next);
      message.success(`${stageMeta(next).label} 단계로 옮겼습니다.`);
      refresh();
    } catch {
      message.error('단계 변경에 실패했습니다.');
    }
  };

  const confirmLost = async () => {
    if (!lostTarget) return;
    if (!lostReason.trim()) {
      message.warning('실패 사유를 입력하세요.');
      return;
    }
    try {
      await dealApi.changeStage(lostTarget.dealId, 'LOST', lostReason.trim());
      message.success('실패로 처리했습니다.');
      setLostTarget(null);
      refresh();
    } catch {
      message.error('단계 변경에 실패했습니다.');
    }
  };

  const remove = async (id: number) => {
    try {
      await dealApi.remove(id);
      message.success('삭제되었습니다.');
      refresh();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const byStage = (s: DealStage) => (data?.items ?? []).filter((d) => d.stage === s);

  const columns: ColumnsType<DealItem> = [
    {
      title: '단계', dataIndex: 'stage', width: 110,
      render: (v: DealStage, r) => (
        <Select size="small" value={v} variant="borderless" style={{ width: 92 }}
          options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
          onChange={(next) => moveStage(r, next)} />
      ),
    },
    { title: '제목', dataIndex: 'title', ellipsis: true },
    {
      title: '거래처', key: 'partner', width: 190, ellipsis: true,
      render: (_, r) => (r.partnerNm ?? <Text type="secondary">-</Text>),
    },
    { title: '담당자', dataIndex: 'empNm', width: 90 },
    {
      title: '예상금액', dataIndex: 'expectedAmt', width: 120, align: 'right',
      sorter: (a, b) => a.expectedAmt - b.expectedAmt,
      render: (v: number) => <Text className="tabular-nums">{fmtNum(v)}</Text>,
    },
    { title: '확률', dataIndex: 'probability', width: 66, align: 'right', render: (v: number) => `${v}%` },
    {
      title: '가중금액', dataIndex: 'weightedAmt', width: 120, align: 'right',
      sorter: (a, b) => a.weightedAmt - b.weightedAmt,
      render: (v: number) => <Text className="tabular-nums" style={{ color: '#1e40af' }}>{fmtNum(v)}</Text>,
    },
    {
      title: '예상 마감', dataIndex: 'expectedCloseDt', width: 120,
      render: (v: string | null, r) => (v
        ? <Text style={{ color: r.overdue ? T.er : undefined }}>
          {dayjs(v).format('YYYY-MM-DD')}{r.overdue ? ' (지남)' : ''}
        </Text>
        : <Text type="secondary">-</Text>),
    },
    {
      title: '활동', key: 'actCount', width: 110,
      render: (_, r) => (
        <Space size={4}>
          <Text style={{ fontSize: 12, color: r.activityCount === 0 ? T.er : T.t2 }}>
            {r.activityCount === 0 ? '없음' : `${r.activityCount}건`}
          </Text>
          <Button type="link" size="small" style={{ padding: 0, fontSize: 12 }} onClick={() => openActivity(r)}>+</Button>
        </Space>
      ),
    },
    {
      title: '', key: 'act', width: 72, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); setFormOpen(true); }} />
          <Popconfirm title="이 영업기회를 삭제할까요?" onConfirm={() => remove(r.dealId)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const card = (d: DealItem) => (
    <Card key={d.dealId} size="small" hoverable
      style={{ marginBottom: 8, borderRadius: 10, borderLeft: `3px solid ${stageMeta(d.stage).color}` }}
      styles={{ body: { padding: 10 } }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <Text strong style={{ fontSize: 12.5, flex: 1 }}>{d.title}</Text>
        <Space size={0}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setEditing(d); setFormOpen(true); }} />
          <Popconfirm title="삭제할까요?" onConfirm={() => remove(d.dealId)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      </div>
      <div style={{ fontSize: 11, color: T.t3, marginTop: 2 }}>
        {d.partnerNm ?? '거래처 없음'} · {d.empNm}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
        <Text strong className="tabular-nums" style={{ fontSize: 13 }}>{fmtShort(d.expectedAmt)}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}>×{d.probability}% = {fmtShort(d.weightedAmt)}</Text>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <Text style={{ fontSize: 11, color: d.activityCount === 0 ? T.er : T.t4 }}>
          {d.activityCount === 0
            ? '활동 없음'
            : `활동 ${d.activityCount}건 · ${dayjs(d.lastActivityDt).format('M/D')}`}
        </Text>
        <Button type="link" size="small" style={{ padding: 0, height: 18, fontSize: 11, marginLeft: 'auto' }}
          onClick={() => openActivity(d)}>+ 활동</Button>
      </div>
      {d.expectedCloseDt && (
        <div style={{ fontSize: 11, marginTop: 4, color: d.overdue ? T.er : T.t4 }}>
          {d.overdue && <WarningOutlined style={{ marginRight: 3 }} />}
          {dayjs(d.expectedCloseDt).format('M/D')} 마감 예상
        </div>
      )}
      {d.lostReason && <div style={{ fontSize: 11, color: T.er, marginTop: 4 }}>사유: {d.lostReason}</div>}
      <Select size="small" value={d.stage} style={{ width: '100%', marginTop: 8 }}
        options={STAGES.map((s) => ({ value: s.value, label: `→ ${s.label}` }))}
        onChange={(next) => moveStage(d, next)} />
    </Card>
  );

  return (
    <PageLayout>
      <PageHeader title="영업기회 파이프라인" />

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={12} md={6}>
          <Card variant="borderless" styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
            <Text style={{ fontSize: 12, color: T.t3 }}>진행중</Text>
            <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: T.t1 }}>
              {fmtNum(data?.openAmt)}
            </div>
            <Text style={{ fontSize: 12, color: T.t3 }}>{data?.openCount ?? 0}건</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card variant="borderless" styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
            <Tooltip title="예상금액 × 수주확률의 합 — 실제로 기대할 수 있는 금액">
              <Text style={{ fontSize: 12, color: T.t3 }}>가중 파이프라인</Text>
            </Tooltip>
            <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: '#0096A2' }}>
              {fmtNum(data?.weightedAmt)}
            </div>
            <Text style={{ fontSize: 12, color: T.t3 }}>확률 반영</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card variant="borderless" styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
            <Text style={{ fontSize: 12, color: T.t3 }}>수주</Text>
            <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: T.ok }}>
              {fmtNum(data?.wonAmt)}
            </div>
            <Text style={{ fontSize: 12, color: T.t3 }}>{data?.wonCount ?? 0}건</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card variant="borderless" styles={{ body: { padding: '14px 18px' } }} style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
            <Text style={{ fontSize: 12, color: T.t3 }}>실패</Text>
            <div className="tabular-nums" style={{ fontSize: 22, fontWeight: 700, color: T.er }}>
              {fmtNum(data?.lostAmt)}
            </div>
            <Text style={{ fontSize: 12, color: T.t3 }}>{data?.lostCount ?? 0}건</Text>
          </Card>
        </Col>
      </Row>

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }}
        style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={[12, 8]} align="middle">
          <Col>
            <Segmented value={view} onChange={(v) => setView(v as 'board' | 'list')}
              options={[{ label: '칸반', value: 'board' }, { label: '목록', value: 'list' }]} />
          </Col>
          <Col>
            <Select allowClear showSearch placeholder="담당자 전체" value={salesEmpId || undefined}
              options={userOptions} style={{ width: 160 }} onChange={(v) => setSalesEmpId(v ?? '')}
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Col>
          <Col>
            <Input.Search allowClear placeholder="제목 · 거래처명" style={{ width: 220 }} onSearch={setKeyword} />
          </Col>
          <Col style={{ marginLeft: 'auto' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              영업기회 등록
            </Button>
          </Col>
        </Row>
      </Card>

      {view === 'board' ? (
        <Row gutter={8} style={{ alignItems: 'flex-start' }}>
          {STAGES.map((s) => {
            const list = byStage(s.value);
            const sum = data?.byStage?.[s.value];
            return (
              <Col key={s.value} flex="1 1 0" style={{ minWidth: 190 }}>
                <div style={{
                  background: '#F8FAFC', borderRadius: 10, padding: 8,
                  border: `1px solid ${T.border2}`, minHeight: 180,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px 8px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color }} />
                    <Text strong style={{ fontSize: 12.5 }}>{s.label}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>{sum?.count ?? 0}</Text>
                    <Text className="tabular-nums" style={{ fontSize: 11, color: T.t3, marginLeft: 'auto' }}>
                      {fmtShort(sum?.expectedAmt ?? 0)}
                    </Text>
                  </div>
                  {list.length === 0
                    ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary" style={{ fontSize: 11 }}>없음</Text>} style={{ margin: '16px 0' }} />
                    : list.map(card)}
                </div>
              </Col>
            );
          })}
        </Row>
      ) : (
        <Table<DealItem>
          columns={columns}
          dataSource={data?.items ?? []}
          loading={isFetching}
          rowKey="dealId"
          size="small"
          bordered
          scroll={{ x: 1180, y: 'calc(100vh - 430px)' }}
          pagination={{ pageSize: 50, size: 'small' }}
          expandable={{
            rowExpandable: (r) => !!r.content,
            expandedRowRender: (r) => (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: T.t2, padding: '4px 8px' }}>{r.content}</div>
            ),
          }}
          locale={{ emptyText: '등록된 영업기회가 없습니다.' }}
        />
      )}

      <Modal
        title="실패 처리"
        open={lostTarget != null}
        onCancel={() => setLostTarget(null)}
        onOk={confirmLost}
        okText="실패로 처리"
        cancelText="취소"
        okButtonProps={{ danger: true }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          “{lostTarget?.title}” 을 실패로 옮깁니다. 다음에 참고할 수 있게 사유를 남겨주세요.
        </Text>
        <Input.TextArea rows={3} style={{ marginTop: 10 }} value={lostReason} maxLength={500}
          onChange={(e) => setLostReason(e.target.value)}
          placeholder="예) 단가 경쟁력 부족 / 납기 조건 불일치 / 경쟁사 수주" />
      </Modal>

      <DealFormModal open={formOpen} editing={editing} onClose={() => setFormOpen(false)} onSaved={refresh} />

      <ActivityFormModal
        open={actOpen}
        editing={null}
        defaultPartner={actTarget?.partnerCd ? { partnerCd: actTarget.partnerCd, partnerNm: actTarget.partnerNm } : undefined}
        defaultDealId={actTarget?.dealId ?? null}
        onClose={() => setActOpen(false)}
        onSaved={() => {
          refresh();
          qc.invalidateQueries({ queryKey: ['activity-list'] });
          qc.invalidateQueries({ queryKey: ['activity-calendar'] });
        }}
      />
    </PageLayout>
  );
}
