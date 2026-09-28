import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table, Tag, Button, Card, Typography, Space, Badge, Descriptions, message,
} from 'antd';
import { SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import StatusDot from '@/components/common/StatusDot';
import apiClient from '@/api/client';
import type { ApiResponse } from '@/types/common';
import dayjs from 'dayjs';

const { Text } = Typography;

interface SyncLog {
  id: number;
  syncType: string;
  direction: string;
  status: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface HealthResult {
  oracleEnabled: boolean;
  oracleConnected: boolean;
  message: string;
  checkedAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  SUCCESS: 'success',
  PARTIAL: 'warning',
  FAILED: 'error',
  RUNNING: 'processing',
};

const SYNC_TYPE_LABEL: Record<string, string> = {
  PARTNER: '거래처',
  EMPLOYEE: '사원',
  DEPARTMENT: '부서',
  ITEM: '품목',
  ORDER: '주문',
  BILLING: '매출',
  DELIVERY: '배송',
  ORDER_WRITE: '주문(쓰기)',
};

export default function ErpSyncPage() {
  const queryClient = useQueryClient();
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['erpSyncLogs'],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<SyncLog[]>>('/lookup/sync-logs');
      return res.data.data ?? [];
    },
    refetchInterval: 30000,
  });

  const healthMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.get<ApiResponse<HealthResult>>('/lookup/health');
      return res.data.data;
    },
    onSuccess: (data) => {
      setHealthResult(data);
    },
    onError: () => {
      message.error('연결 확인 실패');
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/lookup/sync');
    },
    onSuccess: () => {
      message.success('동기화 요청이 완료되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['erpSyncLogs'] });
    },
    onError: () => {
      message.error('동기화 요청에 실패했습니다.');
    },
  });

  const columns: ColumnsType<SyncLog> = [
    {
      title: '유형',
      dataIndex: 'syncType',
      width: 120,
      render: (v: string) => SYNC_TYPE_LABEL[v] ?? v,
    },
    {
      title: '방향',
      dataIndex: 'direction',
      width: 80,
      align: 'center',
      render: (v: string) => (
        <Tag color={v === 'READ' ? 'blue' : 'orange'}>{v}</Tag>
      ),
    },
    {
      title: '상태',
      dataIndex: 'status',
      width: 100,
      align: 'center',
      render: (v: string) => (
        <StatusDot label={v} color={STATUS_COLOR[v] ?? 'default'} />
      ),
    },
    { title: '전체', dataIndex: 'totalCount', width: 70, align: 'right' },
    {
      title: '성공',
      dataIndex: 'successCount',
      width: 70,
      align: 'right',
      render: (v: number) => <span style={{ color: '#52c41a' }}>{v}</span>,
    },
    {
      title: '실패',
      dataIndex: 'failCount',
      width: 70,
      align: 'right',
      render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : v,
    },
    {
      title: '시작',
      dataIndex: 'startedAt',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '완료',
      dataIndex: 'finishedAt',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm:ss') : '-',
    },
    {
      title: '오류',
      dataIndex: 'errorMessage',
      ellipsis: true,
      render: (v: string | null) => v ? (
        <Text type="danger" ellipsis={{ tooltip: v }}>{v}</Text>
      ) : '-',
    },
  ];

  return (
    <PageLayout>
      <PageHeader title="ERP 동기화 관리" />

      {/* 연결 상태 카드 */}
      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button
            icon={<SyncOutlined />}
            loading={healthMutation.isPending}
            onClick={() => healthMutation.mutate()}
          >
            연결 상태 확인
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            loading={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            수동 동기화 실행
          </Button>
        </Space>

        {healthResult && (
          <Descriptions style={{ marginTop: 16 }} size="small" bordered column={2}>
            <Descriptions.Item label="Oracle 활성화">
              {healthResult.oracleEnabled
                ? <Badge status="success" text="활성" />
                : <Badge status="default" text="비활성" />}
            </Descriptions.Item>
            <Descriptions.Item label="연결 상태">
              {healthResult.oracleConnected
                ? <><CheckCircleOutlined style={{ color: '#52c41a' }} /> 정상</>
                : <><CloseCircleOutlined style={{ color: '#ff4d4f' }} /> 실패</>}
            </Descriptions.Item>
            <Descriptions.Item label="메시지" span={2}>
              {healthResult.message}
            </Descriptions.Item>
            <Descriptions.Item label="확인시각" span={2}>
              {dayjs(healthResult.checkedAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      {/* 동기화 이력 */}
      <Card title="동기화 이력 (최근 50건)">
        <Table
          columns={columns}
          dataSource={logs ?? []}
          loading={isLoading}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 900 }}
        />
      </Card>
    </PageLayout>
  );
}
