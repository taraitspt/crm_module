import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Form, Input, Modal, Select, Table, Tag, Typography, message, DatePicker,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import apiClient from '@/api/client';
import type { ApiResponse } from '@/types/common';

const { Text } = Typography;

/* ── 타입 ── */
interface ClosingPeriodItem {
  id: { companyCd: number; plantCd: number; closingType: string; closingYm: string };
  scheduledDt: string | null;
  closedAt: string | null;
  closedBy: string | null;
  note: string | null;
}

const TYPE_OPTIONS = [
  { label: '매출 (SALES)', value: 'SALES' },
  { label: '세금계산서 (TAX)', value: 'TAX' },
];

/* ── API ── */
const closingApi = {
  list: async (type: string) => {
    const res = await apiClient.get<ApiResponse<ClosingPeriodItem[]>>('/closing', { params: { type } });
    return res.data.data ?? [];
  },
  close: async (payload: { type: string; ym: string; scheduledDt?: string; note?: string }) => {
    const res = await apiClient.post<ApiResponse<ClosingPeriodItem>>('/closing', payload);
    return res.data;
  },
  unlock: async (type: string, ym: string) => {
    const res = await apiClient.delete<ApiResponse<void>>(`/closing/${type}/${ym}`);
    return res.data;
  },
};

/* ── 페이지 ── */
export default function ClosingPeriodPage() {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>('SALES');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: rows, isLoading } = useQuery({
    queryKey: ['closing-period', type],
    queryFn: () => closingApi.list(type),
  });

  const closeMutation = useMutation({
    mutationFn: closingApi.close,
    onSuccess: () => {
      message.success('마감 처리가 등록되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['closing-period'] });
      setModalOpen(false);
      form.resetFields();
    },
    onError: (error: any) => message.error(error?.response?.data?.message || '마감 처리에 실패했습니다.'),
  });

  const unlockMutation = useMutation({
    mutationFn: ({ type, ym }: { type: string; ym: string }) => closingApi.unlock(type, ym),
    onSuccess: () => {
      message.success('마감이 해제되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['closing-period'] });
    },
    onError: () => message.error('마감 해제에 실패했습니다.'),
  });

  const columns = useMemo(() => [
    { title: '구분', dataIndex: ['id', 'closingType'], key: 'closingType',
      render: (v: string) => <Tag color={v === 'SALES' ? 'blue' : 'geekblue'}>{v}</Tag> },
    { title: '마감월(YYYYMM)', dataIndex: ['id', 'closingYm'], key: 'closingYm',
      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</Text> },
    { title: '실제 마감 시각', dataIndex: 'closedAt', key: 'closedAt',
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '예약 마감 시각', dataIndex: 'scheduledDt', key: 'scheduledDt',
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '처리자', dataIndex: 'closedBy', key: 'closedBy',
      render: (v: string | null) => v || '-' },
    { title: '비고', dataIndex: 'note', key: 'note',
      render: (v: string | null) => <Text type="secondary">{v || '-'}</Text> },
    { title: '관리', key: 'actions',
      render: (_: any, record: ClosingPeriodItem) => (
        <Button danger size="small" icon={<DeleteOutlined />}
          onClick={() => Modal.confirm({
            title: '마감 해제 확인',
            content: `${record.id.closingType} ${record.id.closingYm} 마감을 해제하시겠습니까?`,
            okText: '해제', cancelText: '취소', okButtonProps: { danger: true },
            onOk: () => unlockMutation.mutate({ type: record.id.closingType, ym: record.id.closingYm }),
          })}>
          해제
        </Button>
      ) },
  ], [unlockMutation]);

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields();
      const ym = (v.month as dayjs.Dayjs).format('YYYYMM');
      const scheduledDt = v.scheduledDt ? (v.scheduledDt as dayjs.Dayjs).toISOString() : undefined;
      closeMutation.mutate({ type: v.type, ym, scheduledDt, note: v.note });
    } catch { /* validation */ }
  };

  return (
    <PageLayout>
      <PageHeader
        title="매출/세금계산서 월마감"
        sub="마감된 월에는 해당 일자로 매출등록·세금계산서발행이 차단됩니다."
        actions={
          <>
            <Select value={type} onChange={setType} options={TYPE_OPTIONS} style={{ width: 200 }} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              마감 추가
            </Button>
          </>
        }
      />

      <Card variant="borderless" style={{ borderRadius: 16, border: '1px solid #f1f5f9' }}>
        <Table<ClosingPeriodItem>
          loading={isLoading}
          dataSource={rows ?? []}
          columns={columns as any}
          rowKey={(r) => `${r.id.closingType}-${r.id.closingYm}`}
          size="small"
          pagination={{ pageSize: 12 }}
        />
      </Card>

      <Modal title="마감 추가" open={modalOpen} onCancel={() => setModalOpen(false)}
        onOk={handleSubmit} okText="등록" cancelText="취소"
        confirmLoading={closeMutation.isPending} width={520}>
        <Form form={form} layout="vertical" initialValues={{ type }}>
          <Form.Item name="type" label="구분" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="month" label="마감 대상 월" rules={[{ required: true, message: '마감할 월을 선택하세요.' }]}>
            <DatePicker picker="month" style={{ width: '100%' }} format="YYYY-MM" />
          </Form.Item>
          <Form.Item name="scheduledDt" label="예약 마감 시각 (선택 — 미입력 시 즉시 마감)">
            <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
          </Form.Item>
          <Form.Item name="note" label="비고">
            <Input.TextArea rows={2} placeholder="마감 사유 등 (선택)" />
          </Form.Item>
        </Form>
      </Modal>
    </PageLayout>
  );
}
