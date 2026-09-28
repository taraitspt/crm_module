import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SaveOutlined } from '@ant-design/icons';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { permissionApi } from '@/api/permission.api';
import { ROLE_META, SCOPE_COLOR, SCOPE_LABEL, SCOPE_OPTIONS, roleMeta } from '@/types/permission';
import type { DataScope, MenuPermissionRow, ResourceScopeRow } from '@/types/permission';
import { T } from '@/theme/designTokens';

const { Text } = Typography;

/**
 * 권한 관리 — 두 축을 한 화면에서 나눠 본다.
 *  메뉴 접근 : 역할 × 메뉴 — 누가 어떤 화면에 들어가는가
 *  데이터 범위 : 역할 × 리소스 — 들어간 화면에서 누구의 데이터까지 보는가
 *
 * 범위를 메뉴가 아니라 리소스(데이터 종류)에 거는 이유:
 * 같은 API 를 여러 화면이 공유하기 때문에 메뉴 단위로 걸면 서버가
 * "지금 어느 화면에서 부른 건지"를 프론트 말만 믿고 판단하게 된다.
 */
export default function MenuPermissionPage() {
  return (
    <PageLayout>
      <PageHeader title="권한 관리" />
      <Tabs
        defaultActiveKey="menu"
        items={[
          { key: 'menu', label: '메뉴 접근', children: <MenuTab /> },
          { key: 'scope', label: '데이터 범위', children: <ScopeTab /> },
        ]}
      />
    </PageLayout>
  );
}

/** 저장 상태 바 — 두 탭이 같이 쓴다. */
function SaveBar({ count, saving, onSave, onReset }: {
  count: number; saving: boolean; onSave: () => void; onReset: () => void;
}) {
  return (
    <Card variant="borderless" styles={{ body: { padding: '10px 16px' } }}
      style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${T.border2}` }}>
      <Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {count > 0 ? `변경 ${count}건` : '변경 없음'}
        </Text>
        <Button type="primary" icon={<SaveOutlined />} loading={saving}
          disabled={count === 0} onClick={onSave}>저장</Button>
        {count > 0 && <Button onClick={onReset}>되돌리기</Button>}
      </Space>
    </Card>
  );
}

/** 역할 열 머리 — 이름과 (범위 탭이면) 일괄 선택 */
function RoleHead({ role, extra }: { role: string; extra?: React.ReactNode }) {
  const meta = roleMeta(role);
  return (
    <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
      <div style={{ fontSize: 12, fontWeight: meta.primary ? 700 : 400, color: meta.primary ? T.t1 : T.t3 }}>
        {meta.label}
      </div>
      {!meta.primary && <div style={{ fontSize: 10, color: T.t4 }}>호환용</div>}
      {extra}
    </div>
  );
}

/* ------------------------------------------------------------------ 메뉴 접근 */

function MenuTab() {
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({ queryKey: ['menu-permissions'], queryFn: () => permissionApi.matrix() });

  /** 편집 중 상태 — menuKey|role → canView */
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const original = useMemo(() => {
    const m: Record<string, boolean> = {};
    (data?.rows ?? []).forEach((r) => Object.entries(r.roles).forEach(([role, v]) => { m[`${r.menuKey}|${role}`] = v; }));
    return m;
  }, [data]);

  useEffect(() => { setDraft(original); }, [original]);

  const changed = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== original[k]),
    [draft, original],
  );

  const toggle = (menuKey: string, role: string) => {
    setDraft((prev) => ({ ...prev, [`${menuKey}|${role}`]: !prev[`${menuKey}|${role}`] }));
  };

  const toggleRole = (role: string, on: boolean) => {
    setDraft((prev) => {
      const next = { ...prev };
      (data?.rows ?? []).forEach((r) => { next[`${r.menuKey}|${role}`] = on; });
      return next;
    });
  };

  const handleSave = async () => {
    if (changed.length === 0) return;
    setSaving(true);
    try {
      await permissionApi.save(changed.map((k) => {
        const [menuKey, role] = k.split('|');
        return { menuKey, role, canView: draft[k] };
      }));
      message.success(`${changed.length}개 항목을 저장했습니다.`);
      await qc.invalidateQueries({ queryKey: ['menu-permissions'] });
      await qc.invalidateQueries({ queryKey: ['my-access'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const roleOrder = data?.roleOrder ?? ROLE_META.map((r) => r.value);

  const columns: ColumnsType<MenuPermissionRow> = [
    {
      title: '메뉴', key: 'menu', width: 240, fixed: 'left',
      render: (_, r) => (
        <div>
          <Text style={{ fontSize: 13 }}>{r.label}</Text>
          {r.adminArea && <Tag color={T.t4} style={{ marginLeft: 6 }}>관리자</Tag>}
          <div style={{ fontSize: 11, color: T.t4 }}>{r.group} · {r.menuKey}</div>
        </div>
      ),
    },
    ...roleOrder.map((role) => {
      const allOn = (data?.rows ?? []).every((r) => draft[`${r.menuKey}|${role}`]);
      return {
        title: (
          <RoleHead role={role} extra={
            <Button type="link" size="small" style={{ padding: 0, height: 16, fontSize: 10 }}
              onClick={() => toggleRole(role, !allOn)}>
              {allOn ? '모두 해제' : '모두 선택'}
            </Button>
          } />
        ),
        key: role,
        width: 94,
        align: 'center' as const,
        render: (_: unknown, r: MenuPermissionRow) => {
          const k = `${r.menuKey}|${role}`;
          const dirty = draft[k] !== original[k];
          return (
            <Checkbox
              checked={!!draft[k]}
              onChange={() => toggle(r.menuKey, role)}
              style={dirty ? { outline: `2px solid ${T.wa}`, outlineOffset: 2, borderRadius: 2 } : undefined}
            />
          );
        },
      };
    }),
  ];

  return (
    <>
      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        message="체크한 메뉴만 해당 역할에게 보입니다."
        description="화면 안에서 누구의 데이터까지 보이는지는 '데이터 범위' 탭에서 정합니다. 역할 변경은 사용자 관리에서 합니다."
      />
      <SaveBar count={changed.length} saving={saving} onSave={handleSave} onReset={() => setDraft(original)} />
      <Table<MenuPermissionRow>
        columns={columns}
        dataSource={data?.rows ?? []}
        loading={isFetching}
        rowKey="menuKey"
        size="small"
        bordered
        pagination={false}
        scroll={{ x: 240 + roleOrder.length * 94 }}
      />
    </>
  );
}

/* ---------------------------------------------------------------- 데이터 범위 */

function ScopeTab() {
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({ queryKey: ['resource-scopes'], queryFn: () => permissionApi.scopeMatrix() });

  /** 편집 중 상태 — resource|role → scope */
  const [draft, setDraft] = useState<Record<string, DataScope>>({});
  const [saving, setSaving] = useState(false);

  const original = useMemo(() => {
    const m: Record<string, DataScope> = {};
    (data?.rows ?? []).forEach((r) => Object.entries(r.roles).forEach(([role, v]) => { m[`${r.resource}|${role}`] = v; }));
    return m;
  }, [data]);

  useEffect(() => { setDraft(original); }, [original]);

  const changed = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== original[k]),
    [draft, original],
  );

  const setScope = (resource: string, role: string, scope: DataScope) => {
    setDraft((prev) => ({ ...prev, [`${resource}|${role}`]: scope }));
  };

  const setRole = (role: string, scope: DataScope) => {
    setDraft((prev) => {
      const next = { ...prev };
      (data?.rows ?? []).forEach((r) => { next[`${r.resource}|${role}`] = scope; });
      return next;
    });
  };

  const handleSave = async () => {
    if (changed.length === 0) return;
    setSaving(true);
    try {
      await permissionApi.saveScopes(changed.map((k) => {
        const [resource, role] = k.split('|');
        return { resource, role, scope: draft[k] };
      }));
      message.success(`${changed.length}개 항목을 저장했습니다.`);
      await qc.invalidateQueries({ queryKey: ['resource-scopes'] });
      await qc.invalidateQueries({ queryKey: ['my-access'] });
      await qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err?.response?.data?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const roleOrder = data?.roleOrder ?? ROLE_META.map((r) => r.value);

  const columns: ColumnsType<ResourceScopeRow> = [
    {
      title: '데이터', key: 'resource', width: 220, fixed: 'left',
      render: (_, r) => (
        <div>
          <Text style={{ fontSize: 13 }}>{r.label}</Text>
          <div style={{ fontSize: 11, color: T.t4 }}>{r.desc}</div>
        </div>
      ),
    },
    ...roleOrder.map((role) => {
      const locked = role === 'ADMIN';   // 관리자에게서 전체를 뺏으면 되돌릴 사람이 없다
      return {
        title: (
          <RoleHead role={role} extra={locked ? (
            <div style={{ fontSize: 10, color: T.t4 }}>고정</div>
          ) : (
            <Select<DataScope | null>
              size="small" variant="borderless" value={null} placeholder="일괄"
              style={{ width: 62, fontSize: 10 }}
              options={SCOPE_OPTIONS}
              onChange={(v) => { if (v) setRole(role, v); }}
            />
          )} />
        ),
        key: role,
        width: 118,
        align: 'center' as const,
        render: (_: unknown, r: ResourceScopeRow) => {
          const k = `${r.resource}|${role}`;
          const dirty = draft[k] !== original[k];
          if (locked) {
            return <Tooltip title="관리자는 항상 전체를 봅니다."><Tag color="green">전체</Tag></Tooltip>;
          }
          return (
            <Select
              size="small"
              value={draft[k] ?? 'SELF'}
              options={SCOPE_OPTIONS}
              onChange={(v) => setScope(r.resource, role, v as DataScope)}
              style={{
                width: 100,
                ...(dirty ? { outline: `2px solid ${T.wa}`, outlineOffset: 1, borderRadius: 6 } : {}),
              }}
            />
          );
        },
      };
    }),
  ];

  return (
    <>
      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        message="역할이 각 데이터를 어디까지 보는지 정합니다."
        description="메뉴가 아니라 데이터 종류로 나눠 둡니다. 같은 영업활동을 캘린더·일자별 현황·거래처 카드가 함께 쓰기 때문에, 데이터에 한 번 걸어 두면 어느 화면으로 들어와도 같은 범위가 적용됩니다."
      />
      <SaveBar count={changed.length} saving={saving} onSave={handleSave} onReset={() => setDraft(original)} />
      <Table<ResourceScopeRow>
        columns={columns}
        dataSource={data?.rows ?? []}
        loading={isFetching}
        rowKey="resource"
        size="small"
        bordered
        pagination={false}
        scroll={{ x: 220 + roleOrder.length * 118 }}
      />
      <div style={{ marginTop: 10 }}>
        <Space size={12} wrap>
          {SCOPE_OPTIONS.map((s) => (
            <Tag key={s.value} color={SCOPE_COLOR[s.value]}>
              {SCOPE_LABEL[s.value]} — {DESC[s.value]}
            </Tag>
          ))}
        </Space>
      </div>
    </>
  );
}

const DESC: Record<DataScope, string> = {
  NONE: '조회 불가',
  SELF: '본인이 담당자인 건',
  DEPT: '같은 부서 구성원의 건',
  ALL: '회사 전체',
};
