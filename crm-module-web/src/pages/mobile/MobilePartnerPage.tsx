import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Select, Spin, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { useAuthStore } from '@/store/authStore';
import { lookupApi } from '@/api/info.api';
import { partnerCardApi } from '@/api/deal.api';
import { typeMeta, type ActivityItem } from '@/types/activity';
import { stageMeta } from '@/types/deal';
import ActivityFormModal from '@/pages/activity/components/ActivityFormModal';
import { T } from '@/theme/designTokens';
import { KV, KpiTile, MCard, MEmpty, Tel, fmtCompact, fmtNum, rate, rateColor } from './mobileKit';

const RECENT_KEY = 'm-recent-partners';
const C_PLAN = '#E06C00';
const C_ACTUAL = '#0096A2';

type Recent = { partnerCd: string; partnerNm: string };
const loadRecent = (): Recent[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
const pushRecent = (p: Recent) => {
  const next = [p, ...loadRecent().filter((r) => r.partnerCd !== p.partnerCd)].slice(0, 8);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
};

/**
 * 거래처 카드 — 검색해서 고르면 기본정보·계획 대비 실적·담당자·영업기회·최근 활동.
 * 방문 전에 보고, 방문 후 바로 활동을 남기는 흐름. 최근 본 거래처는 폰에 기억한다.
 */
const MobilePartnerPage: React.FC = () => {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const partnerCd = params.get('cd') ?? '';
  const [keyword, setKeyword] = useState('');
  const [year, setYear] = useState(dayjs().year());
  const [recent, setRecent] = useState<Recent[]>(loadRecent);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityItem | null>(null);

  const { data: partners, isFetching: searching } = useQuery({
    queryKey: ['activity-partners', keyword],
    queryFn: () => lookupApi.searchPartners(keyword),
    enabled: keyword.trim().length > 0,
  });
  const options = useMemo(() => {
    const list = (partners ?? []).map((p) => ({ value: p.partnerCd, label: `${p.partnerNm} (${p.partnerCd})` }));
    const cur = recent.find((r) => r.partnerCd === partnerCd);
    if (partnerCd && cur && !list.some((o) => o.value === partnerCd)) list.unshift({ value: partnerCd, label: `${cur.partnerNm} (${partnerCd})` });
    return list;
  }, [partners, partnerCd, recent]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['partner-overview', partnerCd, year],
    queryFn: () => partnerCardApi.overview(partnerCd, year),
    enabled: !!partnerCd,
  });

  useEffect(() => {
    if (data?.profile) setRecent(pushRecent({ partnerCd: data.profile.partnerCd, partnerNm: data.profile.partnerNm ?? data.profile.partnerCd }));
  }, [data?.profile]);

  const select = (cd: string | undefined) => {
    if (cd) setParams({ cd }); else setParams({});
  };
  const refresh = () => {
    ['partner-overview', 'activity-calendar', 'activity-list', 'activity-followups', 'today-follow-ups'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const perf = data?.performance;
  const r = perf ? rate(perf.curAmt, perf.planAmt) : null;
  const months = (perf?.months ?? []).map((m) => ({ name: `${Number(m.planMm)}`, plan: m.planAmt, actual: m.actualAmt }));
  const years = [0, 1, 2].map((i) => dayjs().year() - i);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Select showSearch allowClear size="large" placeholder="거래처명 또는 코드 검색" value={partnerCd || undefined}
        options={options} loading={searching} onSearch={setKeyword} filterOption={false} onChange={select}
        notFoundContent={searching ? '검색 중…' : keyword ? '검색 결과가 없습니다' : '검색어를 입력하세요'} style={{ width: '100%' }} />

      {!partnerCd && (
        recent.length === 0 ? <MEmpty text="거래처를 검색해서 선택하세요." /> : (
          <MCard title="최근 본 거래처">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {recent.map((p) => (
                <Tag key={p.partnerCd} onClick={() => select(p.partnerCd)} style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 13, marginInlineEnd: 0 }}>{p.partnerNm}</Tag>
              ))}
            </div>
          </MCard>
        )
      )}

      {partnerCd && isFetching && !data && <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>}
      {!!error && <Alert type="error" showIcon message="거래처 정보를 가져오지 못했습니다." />}

      {data && (
        <>
          <MCard>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: T.t1 }}>{data.profile.partnerNm ?? data.profile.partnerCd}</div>
                <div style={{ fontSize: 12, color: T.t3 }}>{data.profile.partnerCd}{data.profile.bizrNo ? ` · ${data.profile.bizrNo}` : ''}</div>
              </div>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setEditing(null); setModalOpen(true); }}>활동 기록</Button>
            </div>
            <div style={{ marginTop: 8 }}>
              <KV label="대표">{data.profile.ceoNm}</KV>
              <KV label="업태/종목">{[data.profile.bizType, data.profile.bizItem].filter(Boolean).join(' / ') || '-'}</KV>
              <KV label="전화"><Tel no={data.profile.telNo} /></KV>
              <KV label="주소">{data.profile.address}</KV>
            </div>
          </MCard>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.t1 }}>계획 대비 실적</span>
            <Select size="small" value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: `${y}년` }))} style={{ width: 90 }} />
            {perf?.ownerNm && <span style={{ fontSize: 12, color: T.t3 }}>담당 {perf.ownerNm}</span>}
          </div>
          {perf && !perf.erpAvailable && <Alert type="warning" showIcon message="ERP 실적을 가져오지 못해 계획만 표시합니다." />}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <KpiTile label="계획" value={fmtCompact(perf?.planAmt)} />
            <KpiTile label="실적" value={fmtCompact(perf?.curAmt)} sub={`작년 ${fmtCompact(perf?.prevAmt)}`} />
            <KpiTile label="달성률" value={r == null ? '-' : `${r}%`} color={rateColor(r)}
              sub={perf?.changeRate != null ? `전년 대비 ${perf.changeRate > 0 ? '+' : ''}${perf.changeRate}%` : undefined} />
            <KpiTile label="활동" value={`${fmtNum(data.activityCount)}건`} sub={data.lastActivityDt ? `마지막 ${dayjs(data.lastActivityDt).format('M/D')}` : '기록 없음'} />
          </div>
          {months.length > 0 && (
            <MCard title="월별" extra="계획 · 실적">
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={months} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtCompact(v)} width={56} />
                  <Tooltip formatter={(v: number, n: string) => [`${fmtNum(v)}원`, n]} labelFormatter={(l) => `${l}월`} contentStyle={{ fontSize: 12 }} />
                  <Bar dataKey="plan" name="계획" fill={C_PLAN} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
                  <Bar dataKey="actual" name="실적" fill={C_ACTUAL} radius={[3, 3, 0, 0]} maxBarSize={10} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </MCard>
          )}

          <MCard title="담당자" extra={`${data.contacts.length}명`}>
            {data.contacts.length === 0 ? <div style={{ fontSize: 13, color: T.t3 }}>등록된 담당자가 없습니다.</div> : data.contacts.map((c) => (
              <div key={c.contactId} style={{ padding: '6px 0', borderBottom: `1px solid ${T.border3}`, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: T.t1 }}>{c.name}</span>
                  {c.primary && <Tag color="blue" style={{ marginInlineEnd: 0, lineHeight: '16px' }}>주담당</Tag>}
                  <span style={{ color: T.t3, fontSize: 12 }}>{[c.deptNm, c.positionNm].filter(Boolean).join(' · ')}</span>
                </div>
                <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}><Tel no={c.phone ?? c.tel} />{c.email ? ` · ${c.email}` : ''}</div>
              </div>
            ))}
          </MCard>

          {data.deals.length > 0 && (
            <MCard title="영업기회" extra={`${data.deals.length}건`}>
              {data.deals.map((d) => {
                const s = stageMeta(d.stage);
                return (
                  <div key={d.dealId} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: `1px solid ${T.border3}`, fontSize: 13 }}>
                    <Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.label}</Tag>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.t1 }}>{d.title}</span>
                    <span className="tabular-nums" style={{ color: T.t2 }}>{fmtCompact(d.expectedAmt)}</span>
                  </div>
                );
              })}
            </MCard>
          )}

          <MCard title="최근 활동" extra={`${data.activityCount}건`}>
            {data.activities.length === 0 ? <div style={{ fontSize: 13, color: T.t3 }}>기록된 활동이 없습니다.</div> : data.activities.slice(0, 15).map((a) => {
              const m = typeMeta(a.activityType);
              return (
                <div key={a.activityId} onClick={() => { setEditing(a); setModalOpen(true); }}
                  style={{ padding: '7px 0', borderBottom: `1px solid ${T.border3}`, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <span className="tabular-nums" style={{ color: T.t3, fontSize: 12, flex: '0 0 40px' }}>{dayjs(a.activityDt).format('M/D')}</span>
                    <Tag color={m.color} style={{ marginInlineEnd: 0 }}>{m.label}</Tag>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.t1, fontWeight: 600 }}>{a.title}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T.t3, marginTop: 2, paddingLeft: 46 }}>{a.empNm}{a.nextActionDt ? ` · → ${dayjs(a.nextActionDt).format('M/D')} ${a.nextAction ?? ''}` : ''}</div>
                </div>
              );
            })}
          </MCard>
        </>
      )}

      <ActivityFormModal open={modalOpen} editing={editing} defaultSalesEmpId={user?.id}
        defaultPartner={data ? { partnerCd: data.profile.partnerCd, partnerNm: data.profile.partnerNm } : undefined}
        onClose={() => setModalOpen(false)} onSaved={refresh} />
    </div>
  );
};

export default MobilePartnerPage;
