import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Input, Modal, Row, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined } from '@ant-design/icons';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { lookupApi } from '@/api/info.api';
import { permissionApi, userAdminApi } from '@/api/permission.api';
import { RESOURCE_LABEL, ROLE_META, SCOPE_COLOR, SCOPE_LABEL, roleMeta, scopeSummary } from '@/types/permission';
import type { AdminUser, DataScope } from '@/types/permission';
import { T } from '@/theme/designTokens';

const { Text } = Typography;

const ROLE_COLOR: Record<string, string> = {
  ADMIN: '#B91C1C',
  TEAM_LEADER: '#B45309',
  MANAGER: '#0096A2',
  SALES_SPT: '#1E40AF',
};

/** 리소스별 범위 목록 — 목록 열과 수정 모달에서 같이 쓴다. */
function ScopeLines({ scopes }: { scopes?: Record<string, string> | null }) {
  const entries = Object.entries(scopes ?? {});
  if (entries.length === 0) return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      {entries.map(([res, sc]) => (
        <div key={res} style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 11, minWidth: 64 }}>{RESOURCE_LABEL[res] ?? res}</span>
          <Tag color={SCOPE_COLOR[sc as DataScope]} style={{ marginInlineEnd: 0, fontSize: 11 }}>
            {SCOPE_LABEL[sc as DataScope] ?? sc}
          </Tag>
        </div>
      ))}
    </div>
  );
}

/**
 * 사용자 관리 — 역할·부서·상태를 바꾼다. 누가 팀장인지 여기서 지정한다.
 * 데이터 범위는 사람이 아니라 역할에 붙어 있어 여기서 고치지 않는다(권한 관리 > 데이터 범위).
 */
export default function UserAdminPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [deptCd, setDeptCd] = useState<number | undefined>(undefined);
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<{ role: string; deptCd?: number; status: string }>({ role: 'MANAGER', status: 'ACTIVE' });
  const [saving, setSaving] = useState(false);

  const { data: depts } = useQuery({ queryKey: ['departments'], queryFn: () => lookupApi.getDepartments() });
  const deptOptions = useMemo(
    () => (depts ?? []).filter((d) => d.deptCd != null && d.deptNm).map((d) => ({ value: d.deptCd, label: d.deptNm })),
    [depts],
  );

  const { data, isFetching } = useQuery({
    queryKey: ['admin-users', keyword, deptCd, role],
    queryFn: () => userAdminApi.list({ keyword, deptCd, role }),
  });

  // 역할을 고르면 그 역할의 범위가 어떻게 되는지 모달에서 바로 보여준다.
  const { data: scopeMatrix } = useQuery({ queryKey: ['resource-scopes'], queryFn: () => permissionApi.scopeMatrix() });
  const previewScopes = useMemo(() => {
    const m: Record<string, string> = {};
    (scopeMatrix?.rows ?? []).forEach((r) => { m[r.resource] = r.roles[form.role]; });
    return m;
  }, [scopeMatrix, form.role]);

  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setForm({ role: u.role ?? 'MANAGER', deptCd: u.deptCd ?? undefined, status: u.status ?? 'ACTIVE' });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await userAdminApi.update(editing.id, { role: form.role, deptCd: form.deptCd ?? null, status: form.status });
      message.success('저장되었습니다.');
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
      await qc.invalidateQueries({ queryKey: ['my-access'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<AdminUser> = [
    { title: '이름', dataIndex: 'name', width: 110, fixed: 'left' },
    { title: '아이디', dataIndex: 'id', width: 130, render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: '사번', dataIndex: 'employeeNo', width: 100, render: (v) => v ?? '-' },
    { title: '부서', dataIndex: 'deptNm', width: 140, render: (v) => v ?? <Text type="secondary">미지정</Text> },
    {
      title: '역할', dataIndex: 'role', width: 120,
      render: (v: string | null) => {
        const m = roleMeta(v);
        return <Tag color={ROLE_COLOR[v ?? ''] ?? T.t4} style={{ marginInlineEnd: 0 }}>{m.label}</Tag>;
      },
    },
    {
      title: '데이터 범위', dataIndex: 'scopes', width: 130,
      render: (v: Record<string, string> | null) => (
        <Tooltip title={<ScopeLines scopes={v} />} styles={{ body: { maxWidth: 'none' } }}>
          <Text style={{ fontSize: 12, borderBottom: `1px dotted ${T.t4}`, cursor: 'help' }}>
            {scopeSummary(v)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '상태', dataIndex: 'status', width: 84,
      render: (v: string | null) => (v === 'ACTIVE'
        ? <Tag color="#15803D" style={{ marginInlineEnd: 0 }}>활성</Tag>
        : <Tag style={{ marginInlineEnd: 0 }}>비활성</Tag>),
    },
    { title: '이메일', dataIndex: 'email', ellipsis: true, render: (v) => v ?? '-' },
    {
      title: '', key: 'act', width: 56, fixed: 'right',
      render: (_, r) => <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />,
    },
  ];

  return (
    <PageLayout>
      <PageHeader title="사용자 관리" />

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }}
        style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
        <Row gutter={[12, 8]} align="middle">
          <Col>
            <Input.Search allowClear placeholder="이름 · 아이디 · 사번" style={{ width: 240 }} onSearch={setKeyword} />
          </Col>
          <Col>
            <Select allowClear showSearch placeholder="부서 전체" value={deptCd} options={deptOptions}
              style={{ width: 180 }} onChange={(v) => setDeptCd(v)}
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
          </Col>
          <Col>
            <Select allowClear placeholder="역할 전체" value={role || undefined} style={{ width: 150 }}
              options={ROLE_META.map((r) => ({ value: r.value, label: r.label }))}
              onChange={(v) => setRole(v ?? '')} />
          </Col>
          <Col style={{ marginLeft: 'auto' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{data?.length ?? 0}명</Text>
          </Col>
        </Row>
      </Card>

      <Table<AdminUser>
        columns={columns}
        dataSource={data ?? []}
        loading={isFetching}
        rowKey="id"
        size="small"
        bordered
        scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
        pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'], size: 'small' }}
      />

      <Modal
        title={editing ? `${editing.name} 권한 변경` : '권한 변경'}
        open={editing != null}
        onCancel={() => setEditing(null)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="저장"
        cancelText="취소"
        width={460}
      >
        <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={14}>
          <div>
            <Text style={{ fontSize: 12, color: T.t3 }}>역할</Text>
            <Select style={{ width: '100%', marginTop: 4 }} value={form.role}
              onChange={(v) => setForm((f) => ({ ...f, role: v }))}
              options={ROLE_META.map((r) => ({
                value: r.value,
                label: `${r.label}${r.primary ? '' : ' (호환용)'}`,
              }))} />
            <div style={{ marginTop: 8, padding: '8px 10px', background: T.border3, borderRadius: 8 }}>
              <Text style={{ fontSize: 11, color: T.t4, display: 'block', marginBottom: 6 }}>
                이 역할의 데이터 범위 — 권한 관리 &gt; 데이터 범위에서 바꿉니다.
              </Text>
              <ScopeLines scopes={previewScopes} />
            </div>
          </div>
          <div>
            <Text style={{ fontSize: 12, color: T.t3 }}>부서</Text>
            <Select style={{ width: '100%', marginTop: 4 }} showSearch allowClear value={form.deptCd}
              options={deptOptions} onChange={(v) => setForm((f) => ({ ...f, deptCd: v }))}
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
            <Text style={{ fontSize: 11, color: T.t4 }}>
              팀장의 조회 범위가 이 부서로 정해집니다.
            </Text>
          </div>
          <div>
            <Text style={{ fontSize: 12, color: T.t3 }}>상태</Text>
            <Select style={{ width: '100%', marginTop: 4 }} value={form.status}
              onChange={(v) => setForm((f) => ({ ...f, status: v }))}
              options={[{ value: 'ACTIVE', label: '활성' }, { value: 'INACTIVE', label: '비활성 (로그인 불가)' }]} />
          </div>
        </Space>
      </Modal>
    </PageLayout>
  );
}
