import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Button, Space, Select, Input, InputNumber, Switch, Modal, Form, message, Typography, AutoComplete } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { codeApi, type CommonCodeItem } from '@/api/code.api';
import { PageLayout, PageHeader } from '@/components/layout';

const { Text } = Typography;

const CommonCodePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<string>('TAX_TYPE');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CommonCodeItem | null>(null);
  const [form] = Form.useForm();

  const { data: groups = [] } = useQuery({
    queryKey: ['common-code-groups'],
    queryFn: codeApi.getGroups,
  });

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ['common-codes-all', group],
    queryFn: () => codeApi.listAll(group),
    enabled: !!group,
  });

  const groupOptions = useMemo(
    () => Array.from(new Set([...(groups || []), 'TAX_TYPE'])).map((g) => ({ label: g, value: g })),
    [groups],
  );

  const saveMutation = useMutation({
    mutationFn: (item: CommonCodeItem) => codeApi.save(item),
    onSuccess: () => {
      message.success('저장되었습니다.');
      setModalOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['common-codes-all'] });
      queryClient.invalidateQueries({ queryKey: ['common-code-groups'] });
      queryClient.invalidateQueries({ queryKey: ['common-codes'] });
    },
    onError: () => message.error('저장에 실패했습니다.'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ g, code }: { g: string; code: string }) => codeApi.remove(g, code),
    onSuccess: () => {
      message.success('삭제되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['common-codes-all'] });
      queryClient.invalidateQueries({ queryKey: ['common-codes'] });
    },
    onError: () => message.error('삭제에 실패했습니다.'),
  });

  useEffect(() => {
    if (modalOpen) {
      form.setFieldsValue(editing ?? { groupCd: group, code: '', label: '', sortOrder: 0, useYn: true });
    }
  }, [modalOpen, editing, group, form]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item: CommonCodeItem) => {
    setEditing(item);
    setModalOpen(true);
    form.setFieldsValue({ ...item, useYn: item.useYn === 'Y' });
  };

  const handleSave = async () => {
    const v = await form.validateFields();
    saveMutation.mutate({
      groupCd: v.groupCd,
      code: v.code,
      label: v.label,
      sortOrder: v.sortOrder ?? 0,
      useYn: v.useYn ? 'Y' : 'N',
      wrkDiv: v.wrkDiv || undefined,
    });
  };

  const columns: ColumnsType<CommonCodeItem> = [
    { title: '코드', dataIndex: 'code', width: 160 },
    { title: '명칭', dataIndex: 'label', width: 200 },
    { title: '정렬', dataIndex: 'sortOrder', width: 80, align: 'right' },
    { title: '사용', dataIndex: 'useYn', width: 80, align: 'center',
      render: (v: string) => (v === 'Y' ? '사용' : '미사용') },
    { title: '내/외부', dataIndex: 'wrkDiv', width: 90, align: 'center',
      render: (v: string) => (v === 'O' ? '외부' : v === 'I' ? '내부' : '-') },
    {
      title: '관리', width: 140, align: 'center',
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openEdit(record)}>수정</Button>
          <Button size="small" danger onClick={() => Modal.confirm({
            title: '삭제 확인',
            content: `${record.groupCd} / ${record.code} 코드를 삭제하시겠습니까?`,
            okText: '삭제', cancelText: '취소', okButtonProps: { danger: true },
            onOk: () => deleteMutation.mutate({ g: record.groupCd, code: record.code }),
          })}>삭제</Button>
        </Space>
      ),
    },
  ];

  return (
    <PageLayout>
      <PageHeader title="공통코드 관리" />
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Text strong>그룹</Text>
          <Select
            style={{ width: 220 }}
            value={group}
            onChange={setGroup}
            options={groupOptions}
            showSearch
            placeholder="그룹 선택"
          />
          <Button type="primary" onClick={openCreate}>+ 코드 추가</Button>
        </Space>
        <Table
          rowKey={(r) => `${r.groupCd}-${r.code}`}
          columns={columns}
          dataSource={codes}
          loading={isLoading}
          pagination={false}
          bordered
          size="middle"
        />
      </Card>

      <Modal
        title={editing ? '코드 수정' : '코드 추가'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); setEditing(null); }}
        onOk={handleSave}
        okText="저장"
        cancelText="취소"
        confirmLoading={saveMutation.isPending}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="groupCd" label="그룹코드" rules={[{ required: true, message: '그룹코드를 입력하세요.' }]}>
            <AutoComplete
              options={groupOptions}
              placeholder="예: TAX_TYPE"
              disabled={!!editing}
            />
          </Form.Item>
          <Form.Item name="code" label="코드" rules={[{ required: true, message: '코드를 입력하세요.' }]}>
            <Input placeholder="예: TAXABLE" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="label" label="명칭" rules={[{ required: true, message: '명칭을 입력하세요.' }]}>
            <Input placeholder="예: 과세" />
          </Form.Item>
          <Form.Item name="sortOrder" label="정렬순서">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="useYn" label="사용여부" valuePropName="checked">
            <Switch checkedChildren="사용" unCheckedChildren="미사용" />
          </Form.Item>
          <Form.Item name="wrkDiv" label="내/외부 구분" tooltip="작업처(JOB_TYPE) 코드에만 사용. 내부=I, 외부=O.">
            <Select
              allowClear
              placeholder="작업처일 때만 선택 (그 외 비움)"
              options={[{ label: '내부 (I)', value: 'I' }, { label: '외부 (O)', value: 'O' }]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </PageLayout>
  );
};

export default CommonCodePage;
