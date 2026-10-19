import { useState } from 'react';
import { Button, Input, Popover, Space, Tooltip, Typography } from 'antd';
import { MessageFilled, MessageOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface Props {
  memo?: string | null;
  /** 창 제목 — 예: "DNP · 3월 증감사유" */
  title: string;
  /** 없으면 읽기 전용(메모가 있을 때만 아이콘, 마우스 올리면 내용) */
  onSave?: (memo: string) => Promise<void> | void;
}

/**
 * 거래처 × 월 증감사유(월 메모) 아이콘. 메모가 있으면 채운 아이콘 + 마우스 올리면 내용,
 * 누르면 입력 창(onSave 가 있을 때). 월매출계획·매출현황(계획 대비) 공용.
 */
export default function MemoButton({ memo, title, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const has = !!memo && memo.trim() !== '';

  if (!onSave) {
    if (!has) return null;
    return (
      <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{memo}</span>}>
        <MessageFilled style={{ color: '#d97706', fontSize: 12 }} />
      </Tooltip>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft.trim());
      setOpen(false);
    } catch {
      // 실패 안내는 onSave 쪽이 한다 — 창은 열어 둬서 다시 저장할 수 있게
    } finally {
      setSaving(false);
    }
  };

  const icon = has
    ? <MessageFilled style={{ color: '#d97706', fontSize: 12 }} />
    : <MessageOutlined style={{ color: '#cbd5e1', fontSize: 12 }} />;

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={(v) => { if (v) setDraft(memo ?? ''); setOpen(v); }}
      title={title}
      content={(
        <div style={{ width: 280 }}>
          <Input.TextArea
            autoFocus
            rows={3}
            maxLength={500}
            value={draft}
            placeholder="예: 수주불발 / 11월로 이월 / 추가 주문으로 증가"
            onChange={(e) => setDraft(e.target.value)}
          />
          <Space style={{ marginTop: 8, width: '100%', justifyContent: 'flex-end' }}>
            {has && <Button size="small" danger type="text" loading={saving} onClick={() => { void Promise.resolve(onSave('')).then(() => setOpen(false)).catch(() => undefined); }}>지우기</Button>}
            <Button size="small" onClick={() => setOpen(false)}>취소</Button>
            <Button size="small" type="primary" loading={saving} onClick={save}>저장</Button>
          </Space>
        </div>
      )}
    >
      {has
        ? <Tooltip title={open ? undefined : <span style={{ whiteSpace: 'pre-wrap' }}>{memo}</span>}><span style={{ cursor: 'pointer' }}>{icon}</span></Tooltip>
        : <Tooltip title={open ? undefined : <Text style={{ color: '#fff', fontSize: 12 }}>증감사유 메모</Text>}><span style={{ cursor: 'pointer' }}>{icon}</span></Tooltip>}
    </Popover>
  );
}
