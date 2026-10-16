import React, { useMemo, useState } from 'react';
import { App, Button, Card, DatePicker, Form, Input, Modal, Radio, Segmented, Space, Switch, Table, Tag, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { CloseOutlined, DeleteOutlined, EditOutlined, InboxOutlined, NotificationOutlined, PaperClipOutlined, PlusOutlined, PushpinFilled } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, PageLayout } from '@/components/layout';
import { noticeApi } from '@/api/notice.api';
import { NOTICE_CATEGORY, type Notice, type NoticeCategory, type NoticeSaveRequest } from '@/types/notice';
import { useAuthStore } from '@/store/authStore';
import { T } from '@/theme/designTokens';
import NoticeFiles, { fmtSize } from '@/components/notice/NoticeFiles';

const { Text } = Typography;

const TODAY = () => dayjs().format('YYYY-MM-DD');
/** 팝업 상태 — 기간 안이면 게시 중, 시작 전이면 예정, 지났으면 종료. */
const popupState = (n: Notice): { label: string; color: string } | null => {
  if (!n.popupYn || !n.popupStart || !n.popupEnd) return null;
  const t = TODAY();
  if (t < n.popupStart) return { label: '예정', color: 'gold' };
  if (t > n.popupEnd) return { label: '종료', color: 'default' };
  return { label: '팝업 중', color: 'red' };
};
/** 서버와 같은 첨부 규칙 — NoticeService.EXTS / MAX_FILE. 먼저 걸러 올리기 전에 알려 준다. */
const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.xlsm,.ppt,.pptx,.hwp,.hwpx,.txt,.csv,.zip,.png,.jpg,.jpeg,.gif,.mp4';
const FILE_MAX = 95 * 1024 * 1024;
const errMsg = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '처리하지 못했습니다.';

interface FormValues {
  category: NoticeCategory;
  title: string;
  content: string;
  pinned: boolean;
  popupYn: boolean;
  popupRange?: [Dayjs, Dayjs];
}

/** 작성·수정 모달 — 관리자 전용. 팝업을 켜면 기간이 필수. */
const NoticeForm: React.FC<{ open: boolean; editing: Notice | null; onClose: () => void }> = ({ open, editing, onClose }) => {
  const [form] = Form.useForm<FormValues>();
  const qc = useQueryClient();
  const { message } = App.useApp();
  const popupYn = Form.useWatch('popupYn', form);
  /** 새로 올릴 파일 · 지울 기존 첨부 — 저장 버튼을 누를 때 한꺼번에 반영한다. */
  const [newFiles, setNewFiles] = useState<UploadFile[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const existing = (editing?.files ?? []).filter((f) => !removed.includes(f.fileId));

  // 글 저장 → 지운 첨부 삭제 → 새 첨부를 한 건씩 올린다(nginx 한 요청 100MB 제한이라 묶어 보내지 않는다).
  const save = useMutation({
    mutationFn: async (req: NoticeSaveRequest) => {
      const saved = editing ? await noticeApi.update(editing.noticeId, req) : await noticeApi.create(req);
      for (const id of removed) await noticeApi.removeFile(saved.noticeId, id);
      const failed: string[] = [];
      for (let i = 0; i < newFiles.length; i += 1) {
        const uf = newFiles[i];
        message.open({ key: 'notice-upload', type: 'loading', content: `첨부 올리는 중 (${i + 1}/${newFiles.length}) ${uf.name}`, duration: 0 });
        try { await noticeApi.addFile(saved.noticeId, uf.originFileObj as File); } catch (e) { failed.push(`${uf.name}: ${errMsg(e)}`); }
      }
      message.destroy('notice-upload');
      return failed;
    },
    onSuccess: (failed) => {
      if (failed.length) message.warning({ content: `글은 저장했지만 첨부 ${failed.length}건을 올리지 못했습니다 — ${failed.join(', ')}`, duration: 8 });
      else message.success(editing ? '수정했습니다.' : '등록했습니다.');
      qc.invalidateQueries({ queryKey: ['notices'] });
      qc.invalidateQueries({ queryKey: ['notice-popups'] });
      onClose();
    },
    onError: (e) => { message.destroy('notice-upload'); message.error(errMsg(e)); },
  });

  const submit = async () => {
    const v = await form.validateFields();
    save.mutate({
      category: v.category,
      title: v.title.trim(),
      content: v.content,
      pinned: !!v.pinned,
      popupYn: !!v.popupYn,
      popupStart: v.popupYn && v.popupRange ? v.popupRange[0].format('YYYY-MM-DD') : null,
      popupEnd: v.popupYn && v.popupRange ? v.popupRange[1].format('YYYY-MM-DD') : null,
    });
  };

  return (
    <Modal
      open={open}
      title={editing ? '공지 수정' : '공지 작성'}
      width={680}
      okText={editing ? '저장' : '등록'}
      cancelText="취소"
      confirmLoading={save.isPending}
      onOk={submit}
      onCancel={onClose}
      destroyOnClose
      afterOpenChange={(o) => {
        if (!o) return;
        setNewFiles([]);
        setRemoved([]);
        form.setFieldsValue(editing
          ? {
            category: editing.category, title: editing.title, content: editing.content, pinned: editing.pinned, popupYn: editing.popupYn,
            popupRange: editing.popupStart && editing.popupEnd ? [dayjs(editing.popupStart), dayjs(editing.popupEnd)] : undefined,
          }
          : { category: 'UPDATE', title: '', content: '', pinned: false, popupYn: true, popupRange: [dayjs(), dayjs().add(6, 'day')] });
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 12 }}>
        <Form.Item name="category" label="분류">
          <Radio.Group optionType="button" buttonStyle="solid"
            options={(Object.keys(NOTICE_CATEGORY) as NoticeCategory[]).map((k) => ({ value: k, label: NOTICE_CATEGORY[k].label }))} />
        </Form.Item>
        <Form.Item name="title" label="제목" rules={[{ required: true, whitespace: true, message: '제목을 입력해 주세요.' }, { max: 200 }]}>
          <Input placeholder="예: 10월 16일 업데이트 안내" maxLength={200} />
        </Form.Item>
        <Form.Item name="content" label="내용" rules={[{ required: true, whitespace: true, message: '내용을 입력해 주세요.' }]}
          extra="줄바꿈은 그대로 보입니다.">
          <Input.TextArea autoSize={{ minRows: 8, maxRows: 20 }} maxLength={20000} />
        </Form.Item>
        <Space size={32} align="start" wrap>
          <Form.Item name="pinned" label="목록 상단 고정" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="popupYn" label="팝업으로 띄우기" valuePropName="checked">
            <Switch />
          </Form.Item>
          {popupYn && (
            <Form.Item name="popupRange" label="팝업 기간 (시작일·종료일 포함)" rules={[{ required: true, message: '팝업 기간을 정해 주세요.' }]}>
              <DatePicker.RangePicker allowClear={false} />
            </Form.Item>
          )}
        </Space>
        <Form.Item label="첨부파일" extra="매뉴얼·안내문 등 — 한 건 95MB 까지, PDF·오피스·한글·이미지·zip·mp4">
          {existing.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {existing.map((f) => (
                <div key={f.fileId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
                  <PaperClipOutlined style={{ color: T.t3 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span style={{ color: T.t4, fontSize: 12 }}>{fmtSize(f.size)}</span>
                  <Button size="small" type="text" danger icon={<CloseOutlined />} onClick={() => setRemoved((r) => [...r, f.fileId])} />
                </div>
              ))}
            </div>
          )}
          <Upload.Dragger
            multiple
            accept={FILE_ACCEPT}
            fileList={newFiles}
            beforeUpload={(file) => {
              if (file.size > FILE_MAX) { message.error(`${file.name}: 한 건 95MB 까지 올릴 수 있습니다.`); return Upload.LIST_IGNORE; }
              setNewFiles((l) => [...l, { uid: file.uid, name: file.name, size: file.size, originFileObj: file, status: 'done' } as UploadFile]);
              return false;
            }}
            onRemove={(f) => { setNewFiles((l) => l.filter((x) => x.uid !== f.uid)); return true; }}
          >
            <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}><InboxOutlined /></p>
            <p className="ant-upload-text" style={{ fontSize: 14 }}>파일을 끌어다 놓거나 눌러서 고르세요</p>
          </Upload.Dragger>
        </Form.Item>
      </Form>
    </Modal>
  );
};

/**
 * 공지사항 게시판 (2026-10-16) — 업데이트 안내·공지. 읽기는 전원, 작성·수정·삭제는 관리자.
 * 팝업 기간을 정한 공지는 그 기간 동안 로그인 후 팝업으로 뜬다(NoticePopup, PC·모바일 앱 공통).
 */
const NoticePage: React.FC = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const { message, modal } = App.useApp();
  const [keyword, setKeyword] = useState('');
  const [cat, setCat] = useState<'ALL' | NoticeCategory>('ALL');
  const [selected, setSelected] = useState<Notice | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);

  const { data, isFetching } = useQuery({ queryKey: ['notices'], queryFn: noticeApi.list, staleTime: 30_000 });
  const rows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return (data ?? []).filter((n) => (cat === 'ALL' || n.category === cat)
      && (!kw || n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw)));
  }, [data, cat, keyword]);

  const remove = useMutation({
    mutationFn: (id: number) => noticeApi.remove(id),
    onSuccess: () => {
      message.success('삭제했습니다.');
      qc.invalidateQueries({ queryKey: ['notices'] });
      qc.invalidateQueries({ queryKey: ['notice-popups'] });
      setSelected(null);
    },
    onError: (e) => message.error(errMsg(e)),
  });

  const openForm = (n: Notice | null) => { setEditing(n); setSelected(null); setFormOpen(true); };

  const columns: ColumnsType<Notice> = [
    {
      title: '분류', dataIndex: 'category', width: 90, align: 'center',
      render: (c: NoticeCategory) => <Tag color={NOTICE_CATEGORY[c]?.color} style={{ marginInlineEnd: 0 }}>{NOTICE_CATEGORY[c]?.label ?? c}</Tag>,
    },
    {
      title: '제목', dataIndex: 'title',
      render: (t: string, n) => (
        <span style={{ fontWeight: n.pinned ? 700 : 500 }}>
          {n.pinned && <PushpinFilled style={{ color: T.primary700, marginRight: 6 }} />}{t}
          {n.files?.length > 0 && <PaperClipOutlined style={{ color: T.t3, marginLeft: 6 }} />}
        </span>
      ),
    },
    {
      title: '팝업', width: 220,
      render: (_, n) => {
        const s = popupState(n);
        if (!s) return <Text type="secondary">-</Text>;
        return <Space size={6}><Tag color={s.color} style={{ marginInlineEnd: 0 }}>{s.label}</Tag><Text type="secondary" style={{ fontSize: 12 }}>{n.popupStart} ~ {n.popupEnd}</Text></Space>;
      },
    },
    { title: '작성자', dataIndex: 'authorName', width: 110, align: 'center' },
    { title: '등록일', dataIndex: 'createdAt', width: 110, align: 'center', render: (v?: string) => v?.slice(0, 10) ?? '' },
  ];

  return (
    <PageLayout>
      <PageHeader
        title="공지사항"
        actions={isAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>공지 작성</Button>}
      />
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Segmented value={cat} onChange={(v) => setCat(v as typeof cat)}
            options={[{ value: 'ALL', label: '전체' }, ...(Object.keys(NOTICE_CATEGORY) as NoticeCategory[]).map((k) => ({ value: k, label: NOTICE_CATEGORY[k].label }))]} />
          <Input.Search allowClear placeholder="제목·내용 검색" style={{ width: 260 }}
            onSearch={setKeyword} onChange={(e) => { if (!e.target.value) setKeyword(''); }} />
        </div>
        <Table<Notice>
          rowKey="noticeId"
          size="middle"
          loading={isFetching && !data}
          columns={columns}
          dataSource={rows}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          onRow={(n) => ({ onClick: () => setSelected(n), style: { cursor: 'pointer' } })}
          locale={{ emptyText: <div style={{ padding: 24, color: T.t3 }}><NotificationOutlined style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />등록된 공지가 없습니다.</div> }}
        />
      </Card>

      {/* 상세 */}
      <Modal
        open={!!selected}
        width={640}
        onCancel={() => setSelected(null)}
        title={selected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 24 }}>
            <Tag color={NOTICE_CATEGORY[selected.category]?.color} style={{ marginInlineEnd: 0 }}>{NOTICE_CATEGORY[selected.category]?.label}</Tag>
            <span>{selected.title}</span>
          </div>
        )}
        footer={selected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAdmin && (
              <>
                <Button icon={<EditOutlined />} onClick={() => openForm(selected)}>수정</Button>
                <Button danger icon={<DeleteOutlined />} loading={remove.isPending}
                  onClick={() => modal.confirm({
                    title: '이 공지를 삭제할까요?', content: '삭제하면 되돌릴 수 없습니다.', okText: '삭제', okButtonProps: { danger: true }, cancelText: '취소',
                    onOk: () => remove.mutateAsync(selected.noticeId),
                  })}>삭제</Button>
              </>
            )}
            <div style={{ flex: 1 }} />
            <Button type="primary" onClick={() => setSelected(null)}>닫기</Button>
          </div>
        )}
      >
        {selected && (
          <>
            <div style={{ fontSize: 12, color: T.t3, marginBottom: 12 }}>
              {[selected.authorName, selected.createdAt?.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ')}
              {selected.popupYn && selected.popupStart && ` · 팝업 ${selected.popupStart} ~ ${selected.popupEnd}`}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.7, color: T.t1, maxHeight: '60vh', overflowY: 'auto' }}>
              {selected.content}
            </div>
            {selected.files?.length > 0 && <div style={{ marginTop: 16 }}><NoticeFiles noticeId={selected.noticeId} files={selected.files} /></div>}
          </>
        )}
      </Modal>

      {isAdmin && <NoticeForm open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />}
    </PageLayout>
  );
};

export default NoticePage;
