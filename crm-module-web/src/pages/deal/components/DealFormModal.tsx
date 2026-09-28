import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DatePicker, Form, Input, InputNumber, Modal, Select, Slider, message } from 'antd';
import dayjs from 'dayjs';
import { lookupApi } from '@/api/info.api';
import { salesPlanApi } from '@/api/salesPlan.api';
import { dealApi } from '@/api/deal.api';
import { STAGES, stageMeta } from '@/types/deal';
import type { DealItem, DealSaveRequest, DealStage } from '@/types/deal';

interface Props {
  open: boolean;
  editing: DealItem | null;
  defaultPartner?: { partnerCd: string; partnerNm?: string | null };
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  partnerCd?: string;
  salesEmpId: string;
  title: string;
  stage: DealStage;
  expectedAmt?: number | null;
  probability?: number;
  expectedCloseDt?: dayjs.Dayjs | null;
  lostReason?: string;
  content?: string;
}

/** 영업기회 등록·수정 모달. 단계를 바꾸면 확률이 그 단계 기본값으로 따라간다. */
export default function DealFormModal({ open, editing, defaultPartner, onClose, onSaved }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  const [partnerKeyword, setPartnerKeyword] = useState('');
  const stage = Form.useWatch('stage', form);

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
    const pin = (cd?: string | null, nm?: string | null) => {
      if (cd && !list.some((o) => o.value === cd)) list.unshift({ value: cd, label: `${nm ?? ''} (${cd})` });
    };
    pin(editing?.partnerCd, editing?.partnerNm);
    pin(defaultPartner?.partnerCd, defaultPartner?.partnerNm);
    return list;
  }, [partners, editing, defaultPartner]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        partnerCd: editing.partnerCd ?? undefined,
        salesEmpId: editing.salesEmpId,
        title: editing.title,
        stage: editing.stage,
        expectedAmt: editing.expectedAmt,
        probability: editing.probability,
        expectedCloseDt: editing.expectedCloseDt ? dayjs(editing.expectedCloseDt) : null,
        lostReason: editing.lostReason ?? undefined,
        content: editing.content ?? undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        stage: 'LEAD',
        probability: stageMeta('LEAD').probability,
        partnerCd: defaultPartner?.partnerCd,
        expectedAmt: 0,
      });
    }
    setPartnerKeyword('');
  }, [open, editing, defaultPartner, form]);

  const handleOk = async () => {
    let v: FormValues;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const partnerNm = partnerOptions.find((o) => o.value === v.partnerCd)?.label.replace(/\s*\([^)]*\)$/, '') ?? null;
    const payload: DealSaveRequest = {
      partnerCd: v.partnerCd ?? null,
      partnerNm: v.partnerCd ? partnerNm : null,
      salesEmpId: v.salesEmpId,
      title: v.title,
      stage: v.stage,
      expectedAmt: v.expectedAmt ?? 0,
      probability: v.probability ?? null,
      expectedCloseDt: v.expectedCloseDt ? v.expectedCloseDt.format('YYYY-MM-DD') : null,
      lostReason: v.stage === 'LOST' ? (v.lostReason ?? null) : null,
      content: v.content ?? null,
    };
    setSaving(true);
    try {
      if (editing) await dealApi.update(editing.dealId, payload);
      else await dealApi.create(payload);
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
      title={editing ? '영업기회 수정' : '영업기회 등록'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="저장"
      cancelText="취소"
      width={620}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" size="small" style={{ marginTop: 8 }}>
        <Form.Item name="title" label="제목" rules={[{ required: true, message: '제목을 입력하세요' }]}>
          <Input placeholder="예) 2027년 교재 인쇄 정기물량" maxLength={200} />
        </Form.Item>

        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="partnerCd" label="거래처" style={{ flex: 1 }}>
            <Select
              showSearch allowClear placeholder="거래처명 또는 코드로 검색"
              options={partnerOptions} loading={partnerLoading}
              onSearch={setPartnerKeyword} filterOption={false}
              notFoundContent={partnerLoading ? '검색 중…' : '검색어를 입력하세요'}
            />
          </Form.Item>
          <Form.Item name="salesEmpId" label="담당자" rules={[{ required: true, message: '담당자를 선택하세요' }]} style={{ flex: 1 }}>
            <Select showSearch options={userOptions} placeholder="담당자 선택"
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="stage" label="단계" rules={[{ required: true }]} style={{ flex: '0 0 150px' }}>
            <Select
              options={STAGES.map((s) => ({ value: s.value, label: s.label }))}
              onChange={(v: DealStage) => form.setFieldValue('probability', stageMeta(v).probability)}
            />
          </Form.Item>
          <Form.Item name="expectedAmt" label="예상 수주금액" style={{ flex: 1 }}>
            <InputNumber style={{ width: '100%' }} min={0} controls={false}
              formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '')}
              parser={(v) => (Number(v?.replace(/,/g, '') ?? 0) as 0)} />
          </Form.Item>
          <Form.Item name="expectedCloseDt" label="예상 마감일" style={{ flex: '0 0 160px' }}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <Form.Item name="probability" label="수주 확률 (%)" extra="단계를 바꾸면 기본값으로 맞춰집니다. 필요하면 직접 조정하세요.">
          <Slider min={0} max={100} step={5} marks={{ 0: '0', 50: '50', 100: '100' }} />
        </Form.Item>

        {stage === 'LOST' && (
          <Form.Item name="lostReason" label="실패 사유" rules={[{ required: true, message: '실패 사유를 남겨주세요' }]}>
            <Input placeholder="예) 단가 경쟁력 부족 / 경쟁사 수주" maxLength={500} />
          </Form.Item>
        )}

        <Form.Item name="content" label="메모">
          <Input.TextArea rows={3} placeholder="배경, 경쟁 상황, 조건 등" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
