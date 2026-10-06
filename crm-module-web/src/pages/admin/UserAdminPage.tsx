import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Input, Modal, Popconfirm, Row, Segmented, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EditOutlined, UnlockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { lookupApi } from '@/api/info.api';
import { permissionApi, userAdminApi } from '@/api/permission.api';
import { JOB_TITLE_OPTIONS, RESOURCE_LABEL, ROLE_META, SCOPE_COLOR, SCOPE_LABEL, roleMeta, scopeSummary } from '@/types/permission';
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
 * 사용자 관리 — 직책·역할·부서·상태를 바꾼다. 누가 팀장인지 여기서 지정한다. 옛 계정은 체크해서 [미사용 처리](로그인 차단).
 * 직책·미사용 처리·로그인 잠금 해제는 HRM(인사평가) 에서 이식(2026-10-06). 직책은 역할과 별개 — 직책을 바꿔도 역할은 그대로다.
 * 데이터 범위는 사람이 아니라 역할에 붙어 있어 여기서 고치지 않는다(권한 관리 > 데이터 범위).
 */
export default function UserAdminPage() {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState('');
  const [deptCd, setDeptCd] = useState<number | undefined>(undefined);
  const [role, setRole] = useState('');
  // 기본은 재직자만 — 미사용(퇴직)으로 바꾼 옛 계정은 목록에서 빠진다. [미사용]/[전체]로 다시 볼 수 있다.
  const [status, setStatus] = useState<string>('ACTIVE');
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<{ role: string; deptCd?: number; jobTitle?: string; status: string }>({ role: 'MANAGER', status: 'ACTIVE' });
  const [saving, setSaving] = useState(false);

  const { data: depts } = useQuery({ queryKey: ['departments'], queryFn: () => lookupApi.getDepartments() });
  const deptOptions = useMemo(
    () => (depts ?? []).filter((d) => d.deptCd != null && d.deptNm).map((d) => ({ value: d.deptCd, label: d.deptNm })),
    [depts],
  );

  const { data, isFetching } = useQuery({
    queryKey: ['admin-users', keyword, deptCd, role, status],
    queryFn: () => userAdminApi.list({ keyword, deptCd, role, status }),
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
    setForm({ role: u.role ?? 'MANAGER', deptCd: u.deptCd ?? undefined, jobTitle: u.jobTitle ?? undefined, status: u.status ?? 'ACTIVE' });
  };

  const handleUnlock = async (u: AdminUser) => {
    try {
      await userAdminApi.unlock(u.id);
      message.success(`${u.name} 계정 잠금을 해제했습니다.`);
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '잠금 해제에 실패했습니다.');
    }
  };

  /** 체크한 사람들을 한 번에 미사용(퇴직) 또는 재직으로 — 옛 계정 정리용. 미사용은 로그인이 막힌다 */
  const handleBulk = async (to: 'ACTIVE' | 'INACTIVE') => {
    if (selected.length === 0) return;
    setBulkBusy(true);
    try {
      const n = await userAdminApi.bulkStatus(selected, to);
      message.success(to === 'INACTIVE' ? `${n}명을 미사용 처리했습니다.` : `${n}명을 재직으로 되돌렸습니다.`);
      setSelected([]);
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '처리에 실패했습니다.');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await userAdminApi.update(editing.id, { role: form.role, deptCd: form.deptCd ?? null, jobTitle: form.jobTitle ?? null, status: form.status });
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
    // 직책 — 조직상 위치. 역할(시스템 권한)과 다르다.
    {
      title: '직책', dataIndex: 'jobTitle', width: 84,
      onCell: (r) => ({ onClick: () => openEdit(r), style: { cursor: 'pointer' } }),
      render: (v: string | null) => v ? <Tag color={v === '매니저' ? undefined : '#0F766E'} style={{ marginInlineEnd: 0 }}>{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: '역할', dataIndex: 'role', width: 120,
      onCell: (r) => ({ onClick: () => openEdit(r), style: { cursor: 'pointer' } }),
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
        ? <Tag color="#15803D" style={{ marginInlineEnd: 0 }}>재직</Tag>
        : <Tag style={{ marginInlineEnd: 0 }}>미사용</Tag>),
    },
    {
      title: '잠금', key: 'lock', width: 170,
      render: (_, r) => {
        if (r.locked) {
          return (
            <Space size={4}>
              <Tag color="#B91C1C" style={{ marginInlineEnd: 0 }}>잠김</Tag>
              <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(r.lockedUntil).format('HH:mm')}까지</Text>
              <Button size="small" icon={<UnlockOutlined />} onClick={() => handleUnlock(r)}>해제</Button>
            </Space>
          );
        }
        if (r.failedLoginCount > 0) {
          return <Text type="secondary" style={{ fontSize: 12 }}>실패 {r.failedLoginCount}회</Text>;
        }
        return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
      },
    },
    { title: '이메일', dataIndex: 'email', ellipsis: true, render: (v) => v ?? '-' },
    {
      // 아이콘만 있으면 눈에 안 띈다는 피드백(2026-10-06) — 글자를 붙이고, 직책·역할 칸을 눌러도 같은 창이 열린다
      title: '', key: 'act', width: 76, fixed: 'right',
      render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>수정</Button>,
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
          <Col>
            <Segmented value={status} onChange={(v) => { setStatus(v as string); setSelected([]); }}
              options={[{ value: 'ACTIVE', label: '재직' }, { value: 'INACTIVE', label: '미사용' }, { value: '', label: '전체' }]} />
          </Col>
          {selected.length > 0 && (
            <Col>
              <Space size={6}>
                <Text style={{ fontSize: 12 }}>{selected.length}명 선택</Text>
                {status !== 'INACTIVE' && (
                  <Popconfirm title={`${selected.length}명을 미사용 처리할까요?`}
                    description={<span style={{ fontSize: 12 }}>로그인이 막힙니다.<br />나중에 [미사용] 목록에서 다시 재직으로 되돌릴 수 있습니다.</span>}
                    okText="미사용 처리" cancelText="취소" okButtonProps={{ danger: true }} onConfirm={() => handleBulk('INACTIVE')}>
                    <Button size="small" danger loading={bulkBusy}>미사용 처리</Button>
                  </Popconfirm>
                )}
                {status !== 'ACTIVE' && (
                  <Popconfirm title={`${selected.length}명을 재직으로 되돌릴까요?`} okText="재직으로" cancelText="취소" onConfirm={() => handleBulk('ACTIVE')}>
                    <Button size="small" loading={bulkBusy}>재직으로 되돌리기</Button>
                  </Popconfirm>
                )}
                <Button size="small" type="text" onClick={() => setSelected([])}>선택 해제</Button>
              </Space>
            </Col>
          )}
          <Col style={{ marginLeft: 'auto' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{data?.length ?? 0}명</Text>
          </Col>
        </Row>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
          ERP 에서 같이 들어온 옛 계정은 체크해서 [미사용 처리]하세요 — 로그인이 막힙니다. 삭제하지 않는 이유: ERP 에 재직으로 남아 있으면 다음 동기화 때 다시 생기기 때문입니다(미사용 상태는 동기화가 바꾸지 않습니다).
        </Text>
      </Card>

      <Table<AdminUser>
        columns={columns}
        dataSource={data ?? []}
        loading={isFetching}
        rowKey="id"
        size="small"
        bordered
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => setSelected(keys as string[]),
          getCheckboxProps: (u) => ({ disabled: u.id === 'admin' }),
          preserveSelectedRowKeys: true,
        }}
        scroll={{ x: 1200, y: 'calc(100vh - 300px)' }}
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
            <Text style={{ fontSize: 12, color: T.t3 }}>직책</Text>
            <Select style={{ width: '100%', marginTop: 4 }} value={form.jobTitle} placeholder="선택"
              options={JOB_TITLE_OPTIONS}
              onChange={(v) => setForm((f) => ({ ...f, jobTitle: v }))} />
            <Text style={{ fontSize: 11, color: T.t4 }}>
              조직상 직책입니다. 역할(권한)은 아래에서 따로 정합니다. 여기서 바꾼 값은 ERP 동기화가 덮어쓰지 않습니다.
            </Text>
          </div>
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
              options={[{ value: 'ACTIVE', label: '재직' }, { value: 'INACTIVE', label: '미사용 · 퇴직 (로그인 불가)' }]} />
          </div>
        </Space>
      </Modal>
    </PageLayout>
  );
}
