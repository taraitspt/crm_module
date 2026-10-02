import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Popconfirm, Segmented, Tag, message } from 'antd';
import { DeleteOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { useAuthStore } from '@/store/authStore';
import { activityApi } from '@/api/activity.api';
import { typeMeta, type ActivityItem } from '@/types/activity';
import ActivityFormModal from '@/pages/activity/components/ActivityFormModal';
import { syncActivityReminders } from './activityReminders';
import { T } from '@/theme/designTokens';
import { MCard, MEmpty, fmtCompact } from './mobileKit';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 활동 — 월 달력(날짜별 건수 점) + 선택한 날의 활동/팔로업 목록 + 등록 버튼.
 * 기본은 "내 활동"(로그인 사용자) — 현장에서 자기 기록을 남기는 용도라서. 전체는 토글.
 */
const MobileActivityPage: React.FC = () => {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [month, setMonth] = useState<Dayjs>(() => dayjs().startOf('month'));
  const [selected, setSelected] = useState<string>(() => dayjs().format('YYYY-MM-DD'));
  const [mine, setMine] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityItem | null>(null);

  const salesEmpId = mine ? user?.id : undefined;
  const from = month.format('YYYY-MM-DD');
  const to = month.endOf('month').format('YYYY-MM-DD');

  const { data: calendar } = useQuery({
    queryKey: ['activity-calendar', month.year(), month.month() + 1, salesEmpId, undefined],
    queryFn: () => activityApi.calendar(month.year(), month.month() + 1, salesEmpId),
  });
  const { data: list, isFetching } = useQuery({
    queryKey: ['activity-list', from, to, salesEmpId],
    queryFn: () => activityApi.list({ from, to, salesEmpId }),
  });
  const { data: followUps } = useQuery({
    queryKey: ['activity-followups', from, to, salesEmpId],
    queryFn: () => activityApi.followUps(from, to, salesEmpId),
  });

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of calendar ?? []) m.set(d.date, d.total);
    return m;
  }, [calendar]);
  const followByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of followUps ?? []) if (f.nextActionDt) m.set(f.nextActionDt, (m.get(f.nextActionDt) ?? 0) + 1);
    return m;
  }, [followUps]);

  const dayItems = useMemo(() => (list ?? []).filter((a) => a.activityDt === selected), [list, selected]);
  const dayFollows = useMemo(() => (followUps ?? []).filter((a) => a.nextActionDt === selected), [followUps, selected]);

  // 6주 그리드 — 앞뒤 빈 칸은 null
  const cells = useMemo(() => {
    const first = month.startOf('month');
    const out: (Dayjs | null)[] = [];
    for (let i = 0; i < first.day(); i++) out.push(null);
    for (let d = 1; d <= month.daysInMonth(); d++) out.push(first.date(d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  const refresh = () => {
    ['activity-calendar', 'activity-list', 'activity-followups', 'today-follow-ups'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    // 활동을 저장·삭제했으면 폰 알림 예약도 바로 맞춘다(네이티브 앱일 때만 동작)
    void syncActivityReminders(user?.id);
  };
  const remove = async (id: number) => {
    try {
      await activityApi.remove(id);
      message.success('삭제되었습니다.');
      refresh();
    } catch { message.error('삭제에 실패했습니다.'); }
  };
  const goMonth = (delta: number) => {
    const next = month.add(delta, 'month');
    setMonth(next);
    // 같은 날짜가 없으면(31일 등) 그 달 1일
    const d = Math.min(dayjs(selected).date(), next.daysInMonth());
    setSelected(next.date(d).format('YYYY-MM-DD'));
  };

  const today = dayjs().format('YYYY-MM-DD');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Button size="small" type="text" icon={<LeftOutlined />} onClick={() => goMonth(-1)} />
        <span style={{ fontSize: 15, fontWeight: 700, color: T.t1, minWidth: 96, textAlign: 'center' }}>{month.format('YYYY년 M월')}</span>
        <Button size="small" type="text" icon={<RightOutlined />} onClick={() => goMonth(1)} />
        <Button size="small" type="link" onClick={() => { setMonth(dayjs().startOf('month')); setSelected(today); }}>오늘</Button>
        <div style={{ flex: 1 }} />
        <Segmented size="small" value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')}
          options={[{ value: 'mine', label: '내 활동' }, { value: 'all', label: '전체' }]} />
      </div>

      {/* 월 달력 */}
      <MCard style={{ padding: '8px 6px 6px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{ fontSize: 11, color: i === 0 ? T.er : i === 6 ? T.bl : T.t3, paddingBottom: 4 }}>{w}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const key = d.format('YYYY-MM-DD');
            const n = countByDate.get(key) ?? 0;
            const f = followByDate.get(key) ?? 0;
            const on = key === selected;
            const dow = d.day();
            return (
              <button key={key} type="button" onClick={() => setSelected(key)} style={{
                border: 'none', background: on ? T.primary : 'transparent', borderRadius: 10, padding: '5px 0 4px',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontFamily: T.font,
                outline: key === today && !on ? `1.5px solid ${T.primary}` : 'none',
              }}>
                <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? '#fff' : dow === 0 ? T.er : dow === 6 ? T.bl : T.t1 }}>{d.date()}</span>
                <span style={{ display: 'flex', gap: 2, height: 6 }}>
                  {n > 0 && <span style={{ width: 6, height: 6, borderRadius: 3, background: on ? '#fff' : T.primary }} />}
                  {f > 0 && <span style={{ width: 6, height: 6, borderRadius: 3, background: on ? 'rgba(255,255,255,0.7)' : T.wa }} />}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', fontSize: 11, color: T.t3, marginTop: 4, paddingRight: 4 }}>
          <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: T.primary, marginRight: 4 }} />활동</span>
          <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: T.wa, marginRight: 4 }} />팔로업 예정</span>
        </div>
      </MCard>

      {/* 선택한 날 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>{dayjs(selected).format('M월 D일')} ({WEEKDAYS[dayjs(selected).day()]})</span>
        <span style={{ fontSize: 12, color: T.t3 }}>활동 {dayItems.length}건{dayFollows.length > 0 ? ` · 팔로업 ${dayFollows.length}건` : ''}</span>
      </div>

      {dayFollows.length > 0 && (
        <MCard title="팔로업 예정" style={{ borderColor: T.waBd, background: T.waBg }}>
          {dayFollows.map((a) => (
            <div key={`f${a.activityId}`} style={{ padding: '6px 0', borderBottom: `1px solid ${T.waBd}`, fontSize: 13 }}>
              <div style={{ fontWeight: 600, color: T.t1 }}>{a.nextAction ?? '팔로업'}</div>
              <div style={{ fontSize: 12, color: T.t3 }}>{a.partnerNm ?? '거래처 없음'} · {dayjs(a.activityDt).format('M/D')} “{a.title}”에서</div>
            </div>
          ))}
        </MCard>
      )}

      {isFetching && dayItems.length === 0 ? null : dayItems.length === 0 ? (
        <MEmpty text="이 날 기록된 활동이 없습니다." />
      ) : dayItems.map((a) => {
        const meta = typeMeta(a.activityType);
        return (
          <MCard key={a.activityId} onClick={() => { setEditing(a); setModalOpen(true); }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.label}</Tag>
              <span style={{ fontSize: 14, fontWeight: 600, color: T.t1, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
              <Popconfirm title="이 활동을 삭제할까요?" okText="삭제" cancelText="취소" okButtonProps={{ danger: true }}
                onConfirm={(e) => { e?.stopPropagation(); remove(a.activityId); }} onCancel={(e) => e?.stopPropagation()}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
              </Popconfirm>
            </div>
            <div style={{ fontSize: 12, color: T.t3, marginTop: 4 }}>
              {a.partnerNm ?? '거래처 없음'}{!mine && ` · ${a.empNm}`}{a.amount ? ` · ${fmtCompact(a.amount)}원` : ''}
            </div>
            {a.content && <div style={{ fontSize: 13, color: T.t2, marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{a.content}</div>}
            {a.nextActionDt && (
              <div style={{ fontSize: 12, color: T.wa, marginTop: 6 }}>→ {dayjs(a.nextActionDt).format('M/D')} {a.nextAction ?? '팔로업'}</div>
            )}
          </MCard>
        );
      })}

      {/* 등록 버튼 — 하단 탭 위에 띄운다 */}
      <Button type="primary" shape="circle" size="large" icon={<PlusOutlined />}
        onClick={() => { setEditing(null); setModalOpen(true); }}
        style={{ position: 'fixed', right: 16, bottom: 'calc(60px + env(safe-area-inset-bottom) + 16px)', width: 52, height: 52, boxShadow: '0 6px 16px rgba(0,150,162,0.35)', zIndex: 90 }} />

      <ActivityFormModal open={modalOpen} editing={editing} defaultDate={selected} defaultSalesEmpId={user?.id}
        onClose={() => setModalOpen(false)} onSaved={refresh} />
    </div>
  );
};

export default MobileActivityPage;
