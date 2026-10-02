import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DatePicker, Form, Input, InputNumber, Modal, Select, message } from 'antd';
import dayjs from 'dayjs';
import { lookupApi } from '@/api/info.api';
import { salesPlanApi } from '@/api/salesPlan.api';
import { activityApi } from '@/api/activity.api';
import { dealApi } from '@/api/deal.api';
import { stageMeta } from '@/types/deal';
import { ACTIVITY_TYPES } from '@/types/activity';
import type { ActivityItem, ActivitySaveRequest, ActivityType } from '@/types/activity';

interface Props {
  open: boolean;
  /** null 이면 신규 등록 */
  editing: ActivityItem | null;
  /** 신규 등록 시 기본 일자 (캘린더에서 날짜 클릭) */
  defaultDate?: string;
  /** 신규 등록 시 기본 거래처 (거래처 히스토리에서 등록) */
  defaultPartner?: { partnerCd: string; partnerNm?: string | null };
  /** 신규 등록 시 기본 수주 추진 (파이프라인에서 '활동' 버튼으로 등록) */
  defaultDealId?: number | null;
  /** 신규 등록 시 기본 담당자 (모바일 앱은 로그인 사용자) */
  defaultSalesEmpId?: string;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  activityDt: dayjs.Dayjs;
  salesEmpId: string;
  partnerCd?: string;
  activityType: ActivityType;
  title: string;
  content?: string;
  nextActionDt?: dayjs.Dayjs | null;
  nextAction?: string;
  amount?: number | null;
  dealId?: number | null;
}

/** 영업활동 등록·수정 공용 모달. 세 화면이 모두 이걸 띄운다. */
export default function ActivityFormModal({
  open, editing, defaultDate, defaultPartner, defaultDealId, defaultSalesEmpId, onClose, onSaved,
}: Props) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [partnerKeyword, setPartnerKeyword] = useState('');
  // 선택된 거래처의 수주 추진만 후보로 보여준다 — 딜과 활동이 따로 놀지 않게.
  const selectedPartnerCd = Form.useWatch('partnerCd', form);

  const { data: users } = useQuery({ queryKey: ['sales-plan-users', undefined], queryFn: () => salesPlanApi.getUsers() });
  const userOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.id, label: u.deptNm ? `${u.name} (${u.deptNm})` : u.name })),
    [users],
  );

  const { data: partners, isFetching: partnerLoading } = useQuery({
    queryKey: ['activity-partners', partnerKeyword],
    queryFn: () => lookupApi.searchPartners(partnerKeyword),
    enabled: open,
  });
  const partnerOptions = useMemo(() => {
    const list = (partners ?? []).map((p) => ({ value: p.partnerCd, label: `${p.partnerNm} (${p.partnerCd})` }));
    // 수정 중인 건의 거래처가 검색 결과에 없으면 선택값이 코드로만 보이므로 앞에 끼워 넣는다.
    if (editing?.partnerCd && !list.some((o) => o.value === editing.partnerCd)) {
      list.unshift({ value: editing.partnerCd, label: `${editing.partnerNm ?? ''} (${editing.partnerCd})` });
    }
    if (defaultPartner?.partnerCd && !list.some((o) => o.value === defaultPartner.partnerCd)) {
      list.unshift({ value: defaultPartner.partnerCd, label: `${defaultPartner.partnerNm ?? ''} (${defaultPartner.partnerCd})` });
    }
    return list;
  }, [partners, editing, defaultPartner]);

  const { data: dealPipeline } = useQuery({
    queryKey: ['deal-pipeline-for-partner', selectedPartnerCd],
    queryFn: () => dealApi.pipeline({ partnerCd: selectedPartnerCd }),
    enabled: open && !!selectedPartnerCd,
  });
  const dealOptions = useMemo(() => {
    const list = (dealPipeline?.items ?? []).map((d) => ({
      value: d.dealId,
      label: `[${stageMeta(d.stage).label}] ${d.title}`,
    }));
    // 수정 중이거나 파이프라인에서 넘어온 딜이 목록에 없으면 앞에 끼워 넣는다.
    if (editing?.dealId && !list.some((o) => o.value === editing.dealId)) {
      list.unshift({ value: editing.dealId, label: editing.dealTitle ?? `#${editing.dealId}` });
    }
    return list;
  }, [dealPipeline, editing]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        activityDt: dayjs(editing.activityDt),
        salesEmpId: editing.salesEmpId,
        partnerCd: editing.partnerCd ?? undefined,
        activityType: editing.activityType,
        title: editing.title,
        content: editing.content ?? undefined,
        nextActionDt: editing.nextActionDt ? dayjs(editing.nextActionDt) : null,
        nextAction: editing.nextAction ?? undefined,
        amount: editing.amount ?? null,
        dealId: editing.dealId ?? null,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        activityDt: defaultDate ? dayjs(defaultDate) : dayjs(),
        activityType: 'VISIT',
        salesEmpId: defaultSalesEmpId,
        partnerCd: defaultPartner?.partnerCd,
        dealId: defaultDealId ?? null,
      });
    }
    setPartnerKeyword('');
  }, [open, editing, defaultDate, defaultPartner, defaultDealId, defaultSalesEmpId, form]);

  const handleOk = async () => {
    let v: FormValues;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const partnerNm = partnerOptions.find((o) => o.value === v.partnerCd)?.label.replace(/\s*\([^)]*\)$/, '') ?? null;
    const payload: ActivitySaveRequest = {
      activityDt: v.activityDt.format('YYYY-MM-DD'),
      salesEmpId: v.salesEmpId,
      partnerCd: v.partnerCd ?? null,
      partnerNm: v.partnerCd ? partnerNm : null,
      activityType: v.activityType,
      title: v.title,
      content: v.content ?? null,
      nextActionDt: v.nextActionDt ? v.nextActionDt.format('YYYY-MM-DD') : null,
      nextAction: v.nextAction ?? null,
      amount: v.amount ?? null,
      dealId: v.dealId ?? null,
    };
    setSaving(true);
    try {
      if (editing) await activityApi.update(editing.activityId, payload);
      else await activityApi.create(payload);
      message.success(editing ? '수정되었습니다.' : '등록되었습니다.');
      onSaved();
      onClose();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? '영업활동 수정' : '영업활동 등록'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="저장"
      cancelText="취소"
      // 폰(모바일 앱)에서도 같은 모달을 쓴다 — 화면보다 넓어지지 않게
      width="min(620px, calc(100vw - 16px))"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" size="small" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Form.Item name="activityDt" label="일자" rules={[{ required: true, message: '일자를 선택하세요' }]} style={{ flex: '1 0 140px' }}>
            <DatePicker style={{ width: '100%' }} allowClear={false} />
          </Form.Item>
          <Form.Item name="activityType" label="활동유형" rules={[{ required: true }]} style={{ flex: '1 0 120px' }}>
            <Select options={ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          </Form.Item>
          <Form.Item name="salesEmpId" label="담당자" rules={[{ required: true, message: '담당자를 선택하세요' }]} style={{ flex: '1 0 160px' }}>
            <Select showSearch options={userOptions} placeholder="담당자 선택"
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
        </div>

        <Form.Item name="partnerCd" label="거래처" extra="내부 업무 등 거래처가 없으면 비워 두세요.">
          <Select
            showSearch allowClear placeholder="거래처명 또는 코드로 검색"
            options={partnerOptions}
            loading={partnerLoading}
            onSearch={setPartnerKeyword}
            filterOption={false}
            notFoundContent={partnerLoading ? '검색 중…' : '검색어를 입력하세요'}
          />
        </Form.Item>

        <Form.Item name="dealId" label="수주 추진 건"
          extra={selectedPartnerCd ? '이 거래처의 추진 건에 연결하면 추진 건 카드에서 진행 경과가 보입니다.' : '거래처를 먼저 고르면 그 거래처의 추진 건이 표시됩니다.'}>
          <Select allowClear placeholder={selectedPartnerCd ? '연결할 추진 건 선택 (선택)' : '거래처 먼저 선택'}
            options={dealOptions} disabled={!selectedPartnerCd && !editing?.dealId}
            notFoundContent="이 거래처에 등록된 추진 건이 없습니다" />
        </Form.Item>

        <Form.Item name="title" label="제목" rules={[{ required: true, message: '제목을 입력하세요' }]}>
          <Input placeholder="예) 2026년 교재 인쇄 물량 협의" maxLength={200} />
        </Form.Item>

        <Form.Item name="content" label="내용">
          <Input.TextArea rows={4} placeholder="상담 내용, 특이사항" />
        </Form.Item>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Form.Item name="nextActionDt" label="다음 액션 예정일" style={{ flex: '1 0 150px' }}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="nextAction" label="다음에 할 일" style={{ flex: '2 0 180px' }}>
            <Input placeholder="예) 견적서 재발송" maxLength={500} />
          </Form.Item>
          <Form.Item name="amount" label="관련 금액" style={{ flex: '1 0 140px' }}>
            <InputNumber style={{ width: '100%' }} min={0} controls={false}
              formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
              parser={(v) => (Number(v?.replace(/,/g, '') ?? 0) as 0)} />
          </Form.Item>
        </div>
      </Form>
    </Modal>
  );
}
