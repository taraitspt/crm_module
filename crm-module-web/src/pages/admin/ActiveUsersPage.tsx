import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Card, Space, Statistic, Alert, Button, Typography } from 'antd';
import { ReloadOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { activeUsersApi, type ActiveUser } from '@/api/activeUsers.api';

const { Text } = Typography;

const ROLE_LABEL: Record<string, string> = {
  ADMIN: '관리자',
  FINANCE: '회계',
  MANAGER: '매니저',
  PART_LEADER: '파트장',
  CENTER_LEADER: '센터장',
  SALES_SPT: '영업지원',
  STAFF: '사원',
};

/** 마지막 실요청 URI → 화면(무엇을 하는지) 대략 라벨. */
function pathLabel(p: string | null): string {
  if (!p) return '—';
  const path = p.replace(/^\/api/, '');
  if (path.startsWith('/stats') || path.startsWith('/pod')) return '데이터분석';
  if (path.startsWith('/info')) return '정보관리';
  if (path.startsWith('/lookup')) return '조회';
  if (path.startsWith('/admin/active-users')) return '접속현황';
  if (path.startsWith('/admin')) return '관리자';
  if (path.startsWith('/auth')) return '로그인';
  return path;
}

/** 경과초 → 사람이 읽는 상대시간. -1(기록없음)은 대시. */
function agoLabel(sec: number): string {
  if (sec < 0) return '—';
  if (sec < 5) return '방금';
  if (sec < 60) return `${sec}초 전`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}분 전`;
  return `${Math.floor(m / 60)}시간 전`;
}

export default function ActiveUsersPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['activeUsers'],
    queryFn: activeUsersApi.list,
    refetchInterval: 5000, // 5초 자동 새로고침
  });

  const users = data?.users ?? [];
  const activeCount = data?.activeCount ?? 0;
  const onlineCount = data?.onlineCount ?? 0;

  const columns: ColumnsType<ActiveUser> = [
    {
      title: '상태',
      dataIndex: 'active',
      key: 'active',
      width: 92,
      render: (active: boolean) => (active
        ? <Tag color="green">🟢 활동중</Tag>
        : <Tag color="gold">🟡 유휴</Tag>),
    },
    {
      title: '이름',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (name: string | null, r) => <Text strong>{name || r.userId}</Text>,
    },
    { title: 'ID', dataIndex: 'userId', key: 'userId', width: 130, render: (v: string) => <span className="mono-cell">{v}</span> },
    {
      title: '역할',
      dataIndex: 'role',
      key: 'role',
      width: 96,
      render: (role: string | null) => (role ? (ROLE_LABEL[role] ?? role) : '—'),
    },
    {
      title: '현재 위치',
      dataIndex: 'lastPath',
      key: 'lastPath',
      width: 120,
      render: (p: string | null) => pathLabel(p),
    },
    {
      title: '마지막 활동',
      dataIndex: 'lastActivitySec',
      key: 'lastActivitySec',
      width: 110,
      render: (sec: number) => <span className="tabular-nums">{agoLabel(sec)}</span>,
    },
    {
      title: '최근 접속',
      dataIndex: 'lastBeatSec',
      key: 'lastBeatSec',
      width: 110,
      render: (sec: number) => <span className="tabular-nums" style={{ color: '#94a3b8' }}>{agoLabel(sec)}</span>,
    },
  ];

  return (
    <PageLayout>
      <PageHeader title="실시간 접속 현황" />

      <Card style={{ marginBottom: 16 }}>
        <Space size={48} wrap style={{ width: '100%', justifyContent: 'flex-start' }}>
          <Statistic
            title="활동중 (최근 2분)"
            value={activeCount}
            suffix="명"
            prefix={<ThunderboltOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ color: '#16a34a' }}
          />
          <Statistic
            title="접속중 (탭 열림)"
            value={onlineCount}
            suffix="명"
            prefix={<TeamOutlined style={{ color: '#0ea5e9' }} />}
          />
          <Button icon={<ReloadOutlined spin={isFetching} />} onClick={() => refetch()}>
            새로고침
          </Button>
        </Space>

        <div style={{ marginTop: 16 }}>
          {activeCount === 0 ? (
            <Alert
              type="success"
              showIcon
              message="지금 활동 중인 사용자가 없습니다."
              description={onlineCount === 0
                ? '접속 중인 사용자도 없습니다. 재기동해도 안전합니다.'
                : `탭만 열어둔(유휴) 사용자 ${onlineCount}명이 있습니다. 실제 작업 중은 아니라 재기동 영향은 작습니다.`}
            />
          ) : (
            <Alert
              type="warning"
              showIcon
              message={`${activeCount}명이 활동 중입니다.`}
              description="지금 재기동하면 작업이 끊길 수 있습니다. 활동중 0명이 될 때 재기동을 권장합니다."
            />
          )}
        </div>
      </Card>

      <Card title="접속 사용자 목록">
        <Table
          columns={columns}
          dataSource={users}
          loading={isLoading}
          rowKey="userId"
          pagination={false}
          size="small"
          scroll={{ x: 780 }}
          locale={{ emptyText: '접속 중인 사용자가 없습니다.' }}
        />
        <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
          ※ JWT 무상태 인증이라 "열린 탭"은 45초 하트비트로 추정합니다. 활동중=최근 2분 내 실제 요청, 유휴=탭은 열려 있으나 최근 2분 요청 없음. 3분 이상 무응답이면 목록에서 사라집니다(이탈). 서버 재기동 시 목록은 초기화됩니다.
        </Text>
      </Card>
    </PageLayout>
  );
}
