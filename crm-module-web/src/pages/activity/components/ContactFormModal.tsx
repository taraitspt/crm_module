import { useEffect, useState } from 'react';
import { Checkbox, Form, Input, Modal, message } from 'antd';
import { partnerCardApi } from '@/api/deal.api';
import type { PartnerContact, PartnerContactSaveRequest } from '@/types/partnerCard';

interface Props {
  open: boolean;
  partnerCd: string;
  editing: PartnerContact | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  name: string;
  positionNm?: string;
  deptNm?: string;
  phone?: string;
  tel?: string;
  email?: string;
  isPrimary?: boolean;
  memo?: string;
}

/** 고객 담당자 연락처 등록·수정. */
export default function ContactFormModal({ open, partnerCd, editing, onClose, onSaved }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        name: editing.name,
        positionNm: editing.positionNm ?? undefined,
        deptNm: editing.deptNm ?? undefined,
        phone: editing.phone ?? undefined,
        tel: editing.tel ?? undefined,
        email: editing.email ?? undefined,
        isPrimary: editing.primary,
        memo: editing.memo ?? undefined,
      });
    } else {
      form.resetFields();
    }
  }, [open, editing, form]);

  const handleOk = async () => {
    let v: FormValues;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    const payload: PartnerContactSaveRequest = {
      partnerCd,
      name: v.name,
      positionNm: v.positionNm ?? null,
      deptNm: v.deptNm ?? null,
      phone: v.phone ?? null,
      tel: v.tel ?? null,
      email: v.email ?? null,
      isPrimary: !!v.isPrimary,
      memo: v.memo ?? null,
    };
    setSaving(true);
    try {
      if (editing) await partnerCardApi.updateContact(editing.contactId, payload);
      else await partnerCardApi.createContact(payload);
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
      title={editing ? '담당자 수정' : '담당자 등록'}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="저장"
      cancelText="취소"
      width={520}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" size="small" style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]} style={{ flex: 1 }}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="positionNm" label="직위" style={{ flex: 1 }}>
            <Input placeholder="예) 팀장" maxLength={100} />
          </Form.Item>
          <Form.Item name="deptNm" label="부서" style={{ flex: 1 }}>
            <Input placeholder="예) 구매팀" maxLength={100} />
          </Form.Item>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item name="phone" label="휴대폰" style={{ flex: 1 }}>
            <Input placeholder="010-0000-0000" maxLength={40} />
          </Form.Item>
          <Form.Item name="tel" label="유선" style={{ flex: 1 }}>
            <Input maxLength={40} />
          </Form.Item>
        </div>
        <Form.Item name="email" label="이메일" rules={[{ type: 'email', message: '이메일 형식이 아닙니다' }]}>
          <Input maxLength={150} />
        </Form.Item>
        <Form.Item name="memo" label="메모">
          <Input.TextArea rows={2} maxLength={500} placeholder="성향, 결재 라인, 주의사항 등" />
        </Form.Item>
        <Form.Item name="isPrimary" valuePropName="checked">
          <Checkbox>대표 담당자 (거래처당 한 명)</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
