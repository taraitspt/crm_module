import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Button, Card, Col, Descriptions, Empty, Popconfirm, Row, Select, Space, Tabs, Tag, Timeline, Typography, message,
} from 'antd';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { lookupApi } from '@/api/info.api';
import { partnerCardApi } from '@/api/deal.api';
import { activityApi } from '@/api/activity.api';
import { typeMeta } from '@/types/activity';
import type { ActivityItem } from '@/types/activity';
import { stageMeta } from '@/types/deal';
import type { PartnerContact } from '@/types/partnerCard';
import { T } from '@/theme/designTokens';
import ActivityFormModal from './components/ActivityFormModal';
import ContactFormModal from './components/ContactFormModal';

const { Text } = Typography;

const C_PLAN = '#E06C00';
const C_ACTUAL = '#0096A2';
const fmtNum = (v?: number | null) => (v ? `${Math.round(v)}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0');
const fmtEok = (v: number) => (v === 0 ? '0' : `${(v / 1e8).toFixed(1)}억`);
const fmtAxis = (v: number) => (v === 0 ? '0' : `${Math.round(v / 1e8)}억`);

/**
 * 거래처 카드(360도 뷰).
 * 기본정보(ERP) · 올해 계획/실적 · 고객 담당자 연락처 · 수주 추진 · 활동 이력을 한 화면에 모은다.
 * 영업이 고객을 만나기 전에 여는 화면이라는 전제로 구성했다.
 */
export default function PartnerCardPage() {
  const qc = useQueryClient();
  const thisYear = dayjs().year();
  const [partnerCd, setPartnerCd] = useState('');
  const [year, setYear] = useState(thisYear);
  const [keyword, setKeyword] = useState('');
  const [actOpen, setActOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<ActivityItem | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<PartnerContact | null>(null);

  const { data: partners, isFetching: partnerLoading } = useQuery({
    queryKey: ['activity-partners', keyword],
    queryFn: () => lookupApi.searchPartners(keyword),
  });
  const partnerOptions = useMemo(
    () => (partners ?? []).map((p) => ({ value: p.partnerCd, label: `${p.partnerNm} (${p.partnerCd})` })),
    [partners],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['partner-overview', partnerCd, year],
    queryFn: () => partnerCardApi.overview(partnerCd, year),
    enabled: !!partnerCd,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['partner-overview'] });
    qc.invalidateQueries({ queryKey: ['activity-list'] });
    qc.invalidateQueries({ queryKey: ['activity-calendar'] });
    qc.invalidateQueries({ queryKey: ['deal-pipeline'] });
  };

  const removeActivity = async (id: number) => {
    try {
      await activityApi.remove(id);
      message.success('삭제되었습니다.');
      refresh();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const removeContact = async (id: number) => {
    try {
      await partnerCardApi.removeContact(id);
      message.success('삭제되었습니다.');
      refresh();
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  const perf = data?.performance;
  const chartData = useMemo(
    () => (perf?.months ?? []).map((m) => ({ name: `${parseInt(m.planMm, 10)}월`, plan: m.planAmt, actual: m.actualAmt })),
    [perf],
  );
  const rate = perf && perf.planAmt > 0 ? Math.round((perf.curAmt / perf.planAmt) * 1000) / 10 : null;

  const tile = (label: string, value: string, sub?: string, color?: string) => (
    <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }}
      style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
      <Text style={{ fontSize: 12, color: T.t3 }}>{label}</Text>
      <div className="tabular-nums" style={{ fontSize: 20, fontWeight: 700, color: color ?? T.t1, lineHeight: 1.3 }}>{value}</div>
      {sub && <Text style={{ fontSize: 11, color: T.t4 }}>{sub}</Text>}
    </Card>
  );

  return (
    <PageLayout>
      <PageHeader title="거래처 카드" />

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }}
        style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={12} align="middle">
          <Col>
            <Select showSearch placeholder="거래처명 또는 코드로 검색" style={{ width: 360 }}
              value={partnerCd || undefined} options={partnerOptions} loading={partnerLoading}
              onSearch={setKeyword} filterOption={false} onChange={(v) => setPartnerCd(v ?? '')}
              notFoundContent={partnerLoading ? '검색 중…' : '검색어를 입력하세요'} />
          </Col>
          <Col>
            <Select value={year} onChange={setYear} style={{ width: 100 }}
              options={[thisYear - 2, thisYear - 1, thisYear].map((y) => ({ value: y, label: `${y}년` }))} />
          </Col>
          <Col style={{ marginLeft: 'auto' }}>
            <Space>
              <Button icon={<PlusOutlined />} disabled={!partnerCd}
                onClick={() => { setEditingContact(null); setContactOpen(true); }}>담당자 추가</Button>
              <Button type="primary" icon={<PlusOutlined />} disabled={!partnerCd}
                onClick={() => { setEditingAct(null); setActOpen(true); }}>활동 등록</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {!partnerCd && (
        <Empty description="거래처를 선택하면 기본정보·실적·담당자·수주 추진·활동을 한 화면에서 볼 수 있습니다."
          style={{ padding: '64px 0' }} />
      )}

      {partnerCd && data && (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col xs={12} md={6}>{tile(`${year}년 계획`, fmtEok(perf?.planAmt ?? 0),
              perf?.ownerNm ? `담당 ${perf.ownerNm}` : '계획 없음')}</Col>
            <Col xs={12} md={6}>{tile(`${year}년 실적`, fmtEok(perf?.curAmt ?? 0),
              `${year - 1}년 ${fmtEok(perf?.prevAmt ?? 0)}`, C_ACTUAL)}</Col>
            <Col xs={12} md={6}>{tile('달성률', rate == null ? '-' : `${rate}%`,
              perf?.changeRate != null ? `전년 대비 ${perf.changeRate}%` : undefined,
              rate == null ? undefined : rate >= 100 ? T.ok : T.er)}</Col>
            <Col xs={12} md={6}>{tile('활동', `${data.activityCount}건`,
              data.lastActivityDt ? `최근 ${dayjs(data.lastActivityDt).format('YYYY-MM-DD')}` : '기록 없음')}</Col>
          </Row>

          {perf && !perf.erpAvailable && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }}
              message="ERP 실적을 불러오지 못했습니다." description={perf.erpMessage ?? undefined} />
          )}

          <Tabs
            defaultActiveKey="summary"
            items={[
              {
                key: 'summary',
                label: '요약',
                children: (
                  <Row gutter={[12, 12]}>
                    <Col xs={24} lg={10}>
                      <Card variant="borderless" title={<Text strong style={{ fontSize: 13 }}>기본정보 (ERP)</Text>}
                        styles={{ body: { padding: 12 }, header: { minHeight: 40, borderBottom: `1px solid ${T.border2}` } }}
                        style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
                        <Descriptions column={1} size="small" colon={false}
                          labelStyle={{ width: 92, color: T.t3, fontSize: 12 }} contentStyle={{ fontSize: 12 }}>
                          <Descriptions.Item label="거래처명">{data.profile.partnerNm ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="거래처코드">{data.profile.partnerCd}</Descriptions.Item>
                          <Descriptions.Item label="사업자번호">{data.profile.bizrNo ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="대표자">{data.profile.ceoNm ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="업태/종목">
                            {[data.profile.bizType, data.profile.bizItem].filter(Boolean).join(' / ') || '-'}
                          </Descriptions.Item>
                          <Descriptions.Item label="주소">{data.profile.address ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="전화">{data.profile.telNo ?? '-'}</Descriptions.Item>
                          {/* ERP 담당자/연락처 줄은 요청(2026-09-18)으로 제거.
                              담당자는 아래 '담당자' 탭의 CRM 연락처로 관리한다. */}
                        </Descriptions>
                      </Card>
                    </Col>
                    <Col xs={24} lg={14}>
                      <Card variant="borderless" title={<Text strong style={{ fontSize: 13 }}>{year}년 월별 계획 대비 실적</Text>}
                        styles={{ body: { padding: '12px 12px 4px' }, header: { minHeight: 40, borderBottom: `1px solid ${T.border2}` } }}
                        style={{ borderRadius: 12, border: `1px solid ${T.border2}`, height: '100%' }}>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
                            <CartesianGrid stroke={T.border2} vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.t3 }} axisLine={{ stroke: T.border1 }} tickLine={false} />
                            <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} width={44} />
                            <RTooltip formatter={(v: number, n: string) => [fmtNum(v), n]}
                              contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border1}` }} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                            <Bar dataKey="plan" name="계획" fill={C_PLAN} radius={[4, 4, 0, 0]} maxBarSize={20} />
                            <Bar dataKey="actual" name="실적" fill={C_ACTUAL} radius={[4, 4, 0, 0]} maxBarSize={20} />
                          </BarChart>
                        </ResponsiveContainer>
                      </Card>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'contacts',
                label: `담당자 (${data.contacts.length})`,
                children: data.contacts.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 담당자가 없습니다. 상단 ‘담당자 추가’로 등록하세요." />
                  : (
                    <Row gutter={[12, 12]}>
                      {data.contacts.map((c) => (
                        <Col xs={24} md={12} lg={8} key={c.contactId}>
                          <Card variant="borderless" styles={{ body: { padding: 14 } }}
                            style={{ borderRadius: 12, border: `1px solid ${c.primary ? T.primary100 : T.border2}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Text strong style={{ fontSize: 14 }}>{c.name}</Text>
                              {c.positionNm && <Text type="secondary" style={{ fontSize: 12 }}>{c.positionNm}</Text>}
                              {c.primary && <Tag color={T.primary} style={{ marginInlineEnd: 0 }}>대표</Tag>}
                              <Space size={0} style={{ marginLeft: 'auto' }}>
                                <Button type="text" size="small" icon={<EditOutlined />}
                                  onClick={() => { setEditingContact(c); setContactOpen(true); }} />
                                <Popconfirm title="이 담당자를 삭제할까요?" onConfirm={() => removeContact(c.contactId)}>
                                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                              </Space>
                            </div>
                            {c.deptNm && <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>{c.deptNm}</div>}
                            <div style={{ fontSize: 12, color: T.t2, marginTop: 8 }}>
                              {c.phone && <div>📱 {c.phone}</div>}
                              {c.tel && <div>☎ {c.tel}</div>}
                              {c.email && <div>✉ {c.email}</div>}
                            </div>
                            {c.memo && <div style={{ fontSize: 11, color: T.t4, marginTop: 8, whiteSpace: 'pre-wrap' }}>{c.memo}</div>}
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  ),
              },
              {
                key: 'deals',
                label: `수주 추진 (${data.deals.length})`,
                children: data.deals.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 추진 건이 없습니다. 영업관리 → 수주 추진에서 등록하세요." />
                  : (
                    <Row gutter={[12, 12]}>
                      {data.deals.map((d) => {
                        const m = stageMeta(d.stage);
                        return (
                          <Col xs={24} md={12} lg={8} key={d.dealId}>
                            <Card variant="borderless" styles={{ body: { padding: 14 } }}
                              style={{ borderRadius: 12, border: `1px solid ${T.border2}`, borderLeft: `3px solid ${m.color}` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Tag color={m.color} style={{ marginInlineEnd: 0 }}>{m.label}</Tag>
                                <Text strong style={{ fontSize: 13 }}>{d.title}</Text>
                              </div>
                              <div style={{ fontSize: 12, color: T.t3, marginTop: 4 }}>{d.empNm}</div>
                              <div style={{ marginTop: 6 }}>
                                <Text strong className="tabular-nums" style={{ fontSize: 14 }}>{fmtNum(d.expectedAmt)}</Text>
                                <Text type="secondary" style={{ fontSize: 11 }}> ×{d.probability}% = {fmtNum(d.weightedAmt)}</Text>
                              </div>
                              {d.expectedCloseDt && (
                                <div style={{ fontSize: 11, marginTop: 4, color: d.overdue ? T.er : T.t4 }}>
                                  {dayjs(d.expectedCloseDt).format('YYYY-MM-DD')} 마감 예상{d.overdue ? ' (지남)' : ''}
                                </div>
                              )}
                              {d.lostReason && <div style={{ fontSize: 11, color: T.er, marginTop: 4 }}>사유: {d.lostReason}</div>}
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>
                  ),
              },
              {
                key: 'activities',
                label: `활동 (${data.activityCount})`,
                children: data.activities.length === 0
                  ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="등록된 활동이 없습니다." />
                  : (
                    <Card variant="borderless" styles={{ body: { padding: '20px 24px 8px' } }}
                      style={{ borderRadius: 12, border: `1px solid ${T.border2}` }}>
                      <Timeline
                        items={data.activities.map((it) => {
                          const m = typeMeta(it.activityType);
                          return {
                            key: it.activityId,
                            color: m.color,
                            children: (
                              <div style={{ paddingBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Text strong style={{ fontSize: 13 }}>{dayjs(it.activityDt).format('YYYY-MM-DD')}</Text>
                                  <Tag color={m.color} style={{ marginInlineEnd: 0 }}>{m.label}</Tag>
                                  <Text style={{ fontSize: 13 }}>{it.title}</Text>
                                  <Space size={0} style={{ marginLeft: 'auto' }}>
                                    <Button type="text" size="small" icon={<EditOutlined />}
                                      onClick={() => { setEditingAct(it); setActOpen(true); }} />
                                    <Popconfirm title="이 활동을 삭제할까요?" onConfirm={() => removeActivity(it.activityId)}>
                                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  </Space>
                                </div>
                                <div style={{ fontSize: 12, color: T.t3, marginTop: 2 }}>
                                  {it.empNm}{it.deptNm ? ` · ${it.deptNm}` : ''}
                                  {it.amount != null ? ` · ${fmtNum(it.amount)}원` : ''}
                                </div>
                                {it.content && <div style={{ fontSize: 12, color: T.t2, marginTop: 6, whiteSpace: 'pre-wrap' }}>{it.content}</div>}
                                {it.nextActionDt && (
                                  <div style={{ fontSize: 12, color: T.wa, marginTop: 6 }}>
                                    ★ {dayjs(it.nextActionDt).format('YYYY-MM-DD')} {it.nextAction ?? '팔로업 예정'}
                                  </div>
                                )}
                              </div>
                            ),
                          };
                        })}
                      />
                    </Card>
                  ),
              },
            ]}
          />
        </>
      )}

      {isLoading && partnerCd && <Card loading variant="borderless" style={{ borderRadius: 12 }} />}

      <ActivityFormModal
        open={actOpen}
        editing={editingAct}
        defaultPartner={partnerCd ? { partnerCd, partnerNm: data?.profile.partnerNm } : undefined}
        onClose={() => setActOpen(false)}
        onSaved={refresh}
      />
      <ContactFormModal
        open={contactOpen}
        partnerCd={partnerCd}
        editing={editingContact}
        onClose={() => setContactOpen(false)}
        onSaved={refresh}
      />
    </PageLayout>
  );
}
