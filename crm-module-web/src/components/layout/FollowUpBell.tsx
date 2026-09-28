import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Empty, Modal, Popover, Tag, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/authStore';
import { activityApi } from '@/api/activity.api';
import { typeMeta } from '@/types/activity';
import type { ActivityItem } from '@/types/activity';
import { T } from '@/theme/designTokens';

const { Text } = Typography;
const SEEN_KEY = 'crm.followup.seen';

/**
 * 오늘 예정된 영업 일정 알림.
 * - 헤더 종 아이콘에 본인 담당 건수 배지
 * - 그날 처음 열었을 때 한 번만 팝업(같은 날 다시 뜨지 않게 localStorage 에 기록)
 * 기준은 활동일이 아니라 nextActionDt(다음 액션 예정일)다.
 */
export default function FollowUpBell() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const today = dayjs().format('YYYY-MM-DD');
  const [popOpen, setPopOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['today-follow-ups', today, user?.id],
    queryFn: () => activityApi.followUps(today, today, user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  const items = useMemo(() => data ?? [], [data]);

  useEffect(() => {
    if (items.length === 0) return;
    let seen: string | null = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch { /* 사생활 보호 모드 등 — 팝업만 매번 뜬다 */ }
    if (seen === today) return;
    setModalOpen(true);
    try { localStorage.setItem(SEEN_KEY, today); } catch { /* 저장 못 해도 동작에는 지장 없음 */ }
  }, [items, today]);

  const goCalendar = () => {
    setPopOpen(false);
    setModalOpen(false);
    navigate('/activity/calendar');
  };

  const row = (it: ActivityItem) => {
    const meta = typeMeta(it.activityType);
    return (
      <div key={it.activityId} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border3}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.label}</Tag>
          <Text strong style={{ fontSize: 13 }}>{it.nextAction ?? '팔로업 예정'}</Text>
        </div>
        <div style={{ fontSize: 12, color: T.t3, marginTop: 3 }}>
          {it.partnerNm ?? '거래처 없음'}
        </div>
        <div style={{ fontSize: 11, color: T.t4, marginTop: 2 }}>
          {dayjs(it.activityDt).format('M/D')} “{it.title}” 에서 잡은 일정
        </div>
      </div>
    );
  };

  const list = items.length === 0
    ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="오늘 예정된 일정이 없습니다." style={{ margin: '8px 0' }} />
    : <div style={{ maxHeight: 340, overflowY: 'auto' }}>{items.map(row)}</div>;

  return (
    <>
      <Popover
        open={popOpen}
        onOpenChange={setPopOpen}
        trigger="click"
        placement="bottomRight"
        title={<Text strong style={{ fontSize: 13 }}>오늘 예정 ({dayjs().format('M월 D일')})</Text>}
        content={
          <div style={{ width: 300 }}>
            {list}
            <Button type="link" size="small" style={{ paddingLeft: 0, marginTop: 4 }} onClick={goCalendar}>
              캘린더에서 보기
            </Button>
          </div>
        }
      >
        <Badge count={items.length} size="small" offset={[-2, 2]}>
          <Button type="text" icon={<BellOutlined style={{ fontSize: 17 }} />} title="오늘 예정된 일정" />
        </Badge>
      </Popover>

      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={`오늘 예정된 일정이 ${items.length}건 있습니다`}
        footer={[
          <Button key="close" onClick={() => setModalOpen(false)}>닫기</Button>,
          <Button key="go" type="primary" onClick={goCalendar}>캘린더 열기</Button>,
        ]}
        width={460}
      >
        {list}
      </Modal>
    </>
  );
}
