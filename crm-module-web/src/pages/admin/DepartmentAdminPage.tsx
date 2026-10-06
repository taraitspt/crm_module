import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Dropdown, Form, Input, Modal, Popconfirm, Popover, Select, Space, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ApartmentOutlined, DownOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { departmentAdminApi, type AdminDepartment, type UseResult } from '@/api/department.api';
import { userAdminApi } from '@/api/permission.api';
import { JOB_TITLES } from '@/types/permission';
import { T } from '@/theme/designTokens';

const { Text } = Typography;

/** 트리 행 — antd Table 의 children 로 조직도를 그린다 */
type Row = AdminDepartment & { key: number; depth: number; children?: Row[] };

/** 부서 추가·이름 변경 창 */
type Editing = { mode: 'create'; upDeptCd: number | null } | { mode: 'rename'; dept: AdminDepartment };

/** 옮기기 창 — 체크한 부서들의 상위 부서 지정 / 어떤 부서 아래로 기존 부서 가져오기 */
type Moving = { mode: 'parent'; deptCds: number[] } | { mode: 'children'; parent: AdminDepartment };

/** 옮기기 창의 "최상위" 값 — Select 는 null 을 "아직 안 고름"과 구분하지 못해서 0 으로 둔다(부서 코드 0 은 없다) */
const TOP = 0;

/** 부서 표시 — ERP 부서는 "이름 (코드)", 직접 추가한 묶음은 부서 코드가 없으므로 이름만(90001~ 번호는 내부 키일 뿐) */
const deptLabel = (d: AdminDepartment) => (d.manual ? d.deptNm : `${d.deptNm} (${d.deptCd})`);

/** 같은 줄 안의 순서 — 관리자가 정한 순서(sort_order) 먼저, 없으면 뒤에 부서 코드 순 */
const orderCmp = (a: AdminDepartment, b: AdminDepartment) => {
  const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return ao !== bo ? ao - bo : a.deptCd - b.deptCd;
};

type DropPos = 'before' | 'after';

/** 위로 올라가며 상위 부서 코드 모음 — 내 상위를 내 아래로 가져오면 고리가 되므로 후보에서 뺀다 */
const ancestorsOf = (depts: AdminDepartment[], deptCd: number) => {
  const upOf = new Map(depts.map((d) => [d.deptCd, d.upDeptCd]));
  const out = new Set<number>();
  let cur = upOf.get(deptCd) ?? null;
  while (cur != null && !out.has(cur)) { out.add(cur); cur = upOf.get(cur) ?? null; }
  return out;
};

const errMsg = (e: unknown) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '저장에 실패했습니다.';

/**
 * 부서 관리 — 상위 부서(조직도)와 부서장 지정, 부서 추가·미사용.
 * ERP(MA_DEPT_MST.UP_DEPT_CD)가 채워 주는 게 기본이고, ERP 에도 없는 부서는 여기서 관리자가 직접 잇는다.
 * HRM(인사평가) 부서 관리 화면을 그대로 이식했다(2026-10-06).
 * 부서장: 본부장처럼 ERP 상 "임원" 부서에 있어 직책·부서만으로는 어느 본부를 맡는지 모르는 사람을 부서에 직접 붙인다.
 * ERP 동기화는 건드리지 않는다.
 * 미사용: ERP 에 남아 있는 옛 부서를 숨긴다(ERP 부서는 지워도 동기화가 다시 만들어서 삭제 대신 미사용).
 * 직접 추가: ERP 에 없는 묶음(본부 노드 등, 90001~). 사람은 동기화가 ERP 부서로 되돌리므로 하위 부서·부서장만 둔다.
 */
export default function DepartmentAdminPage() {
  const qc = useQueryClient();
  const [form] = Form.useForm<{ deptNm: string; upDeptCd?: number; headEmployeeNo?: string }>();
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [showUnused, setShowUnused] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [moveTo, setMoveTo] = useState<number | undefined>(undefined);
  const [moveDepts, setMoveDepts] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  // 끌어다 놓기 — 손잡이(⋮⋮)로 잡은 부서, 놓을 자리 표시(그 줄의 위/아래 선)
  const [dragCd, setDragCd] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<{ cd: number; pos: DropPos } | null>(null);

  const { data, isFetching } = useQuery({ queryKey: ['admin-departments'], queryFn: () => departmentAdminApi.list() });
  const depts = useMemo(() => data ?? [], [data]);
  const visible = useMemo(() => (showUnused ? depts : depts.filter((d) => d.inUse)), [depts, showUnused]);
  const unusedCount = depts.length - depts.filter((d) => d.inUse).length;

  // 부서장 후보 = 재직자 전원 — 직책 높은 순(본부장·팀장이 위) → 이름순. 이름·직책·부서로 검색된다
  const { data: activeUsers } = useQuery({
    queryKey: ['admin-users', 'head-candidates'],
    queryFn: () => userAdminApi.list({ status: 'ACTIVE' }),
    staleTime: 5 * 60_000,
  });
  const headOptions = useMemo(() => {
    const rank = (t: string | null) => JOB_TITLES.indexOf((t ?? '매니저') as (typeof JOB_TITLES)[number]);
    return (activeUsers ?? [])
      .filter((u) => !!u.employeeNo)
      .sort((a, b) => rank(b.jobTitle) - rank(a.jobTitle) || (a.name ?? '').localeCompare(b.name ?? ''))
      .map((u) => ({ value: u.employeeNo as string, label: [u.name, u.jobTitle, u.deptNm ? `· ${u.deptNm}` : ''].filter(Boolean).join(' ') }));
  }, [activeUsers]);

  // 상위 부서 후보 = 사용 중인 부서. 미사용 부서는 지금 걸려 있는 값일 때만 이름이 보이게 남겨 둔다(고를 수는 없음)
  const parentOptions = useMemo(
    () => depts.map((d) => ({ value: d.deptCd, label: `${deptLabel(d)}${d.inUse ? '' : ' · 미사용'}`, disabled: !d.inUse })),
    [depts],
  );
  const parentOptionsFor = (r: Row) => parentOptions.filter((o) => o.value !== r.deptCd && (!o.disabled || o.value === r.upDeptCd));

  /** upDeptCd 로 트리를 만든다. 상위가 없거나(최상위) 상위 부서가 목록에 없으면 뿌리로 둔다. */
  const tree = useMemo<Row[]>(() => {
    const byCd = new Map<number, Row>(visible.map((d) => [d.deptCd, { ...d, key: d.deptCd, depth: 0 }]));
    const roots: Row[] = [];
    byCd.forEach((row) => {
      const parent = row.upDeptCd != null ? byCd.get(row.upDeptCd) : undefined;
      if (parent && parent !== row) (parent.children ??= []).push(row);
      else roots.push(row);
    });
    const setDepth = (rows: Row[], depth: number) => rows.forEach((r) => { r.depth = depth; if (r.children) setDepth(r.children, depth + 1); });
    setDepth(roots, 0);
    const sortRec = (rows: Row[]) => { rows.sort(orderCmp); rows.forEach((r) => r.children && sortRec(r.children)); };
    sortRec(roots);
    return roots;
  }, [visible]);

  /** 부서 → 같은 줄(형제) 배열 — 끌어다 놓을 때 순서·자리를 계산한다. 최상위는 tree 그 자체 */
  const siblingsOf = useMemo(() => {
    const m = new Map<number, Row[]>();
    const walk = (rows: Row[]) => rows.forEach((r) => { m.set(r.deptCd, rows); if (r.children) walk(r.children); });
    walk(tree);
    return m;
  }, [tree]);

  // 검색어가 있으면 트리 대신 평면 목록으로 보여 준다 — 상위 부서가 없는 부서만 찾는 용도가 많아서
  const kw = q.trim().toLowerCase();
  const flat = useMemo(() => {
    if (!kw) return null;
    // 사람 이름·사번으로도 찾는다 — "이 사람 어느 부서지?" 용
    return visible.filter((d) => d.deptNm.toLowerCase().includes(kw) || (!d.manual && String(d.deptCd).includes(kw))
        || (d.members ?? []).some((m) => m.name.toLowerCase().includes(kw) || m.employeeNo.includes(kw)))
      .map<Row>((d) => ({ ...d, key: d.deptCd, depth: 0 }));
  }, [visible, kw]);

  const rootsWithoutParent = depts.filter((d) => d.inUse && d.upDeptCd == null).length;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['admin-departments'] });
    await qc.invalidateQueries({ queryKey: ['departments'] });
    await qc.invalidateQueries({ queryKey: ['lookup', 'dept-tree'] });
  };

  const setParent = async (d: AdminDepartment, upDeptCd: number | null) => {
    setSaving(d.deptCd);
    try {
      await departmentAdminApi.setParent(d.deptCd, upDeptCd);
      message.success(`${d.deptNm}의 상위 부서를 바꿨습니다.`);
      await refresh();
    } catch (e: unknown) {
      message.error(errMsg(e));
    } finally {
      setSaving(null);
    }
  };

  const setHead = async (d: AdminDepartment, employeeNo: string | null) => {
    setSaving(d.deptCd);
    try {
      await departmentAdminApi.setHead(d.deptCd, employeeNo);
      message.success(employeeNo ? `${d.deptNm}의 부서장을 지정했습니다.` : `${d.deptNm}의 부서장을 해제했습니다.`);
      await qc.invalidateQueries({ queryKey: ['admin-departments'] });
    } catch (e: unknown) {
      message.error(errMsg(e));
    } finally {
      setSaving(null);
    }
  };

  /** 여러 부서 처리 결과 — 바뀐 수는 메시지로, 서버가 건너뛴 부서는 사유 목록으로 */
  const report = (res: UseResult, done: string) => {
    if (res.changed) message.success(`${res.changed}개 부서를 ${done}.`);
    if (res.skipped.length) {
      Modal.warning({
        title: `${res.skipped.length}개 부서는 바꾸지 못했습니다`,
        content: <ul style={{ paddingLeft: 18, margin: '8px 0 0' }}>{res.skipped.map((s) => <li key={s}>{s}</li>)}</ul>,
        okText: '확인',
      });
    } else if (!res.changed) {
      message.info('바뀐 부서가 없습니다.');
    }
  };

  /** 사용 / 미사용 — 막힌 부서는 서버가 건너뛰고 사유를 돌려준다 */
  const setInUse = async (deptCds: number[], inUse: boolean) => {
    if (deptCds.length === 1) setSaving(deptCds[0]);
    else setBusy(true);
    try {
      report(await departmentAdminApi.setInUse(deptCds, inUse), inUse ? '다시 사용으로 바꿨습니다' : '미사용으로 바꿨습니다');
      setSelected((prev) => prev.filter((cd) => !deptCds.includes(cd)));
      await refresh();
    } catch (e: unknown) {
      message.error(errMsg(e));
    } finally {
      setSaving(null);
      setBusy(false);
    }
  };

  const remove = async (d: AdminDepartment) => {
    setSaving(d.deptCd);
    try {
      await departmentAdminApi.remove(d.deptCd);
      message.success(`${d.deptNm}을(를) 지웠습니다.`);
      setSelected((prev) => prev.filter((cd) => cd !== d.deptCd));
      await refresh();
    } catch (e: unknown) {
      message.error(errMsg(e));
    } finally {
      setSaving(null);
    }
  };

  /** 놓을 수 있는 줄인가 — 자기 자신·자기 하위 부서 줄에는 못 놓는다(고리) */
  const canDropOn = (r: Row) => dragCd != null && dragCd !== r.deptCd && !ancestorsOf(depts, r.deptCd).has(dragCd);

  /**
   * 끌어다 놓기 — 같은 줄(형제) 안이면 순서만 바꾸고, 다른 줄이면 확인을 받아 그 상위 부서 아래로 옮긴 뒤 그 자리에 둔다.
   * 놓은 줄의 위/아래(pos)에 끼워 넣는다.
   */
  const dropOn = async (target: Row, pos: DropPos) => {
    const cd = dragCd;
    setDragCd(null);
    setDropHint(null);
    if (cd == null || cd === target.deptCd) return;
    const dragged = depts.find((d) => d.deptCd === cd);
    const sibs = siblingsOf.get(target.deptCd);
    if (!dragged || !sibs) return;
    const order = sibs.map((s) => s.deptCd).filter((x) => x !== cd);
    order.splice(order.indexOf(target.deptCd) + (pos === 'after' ? 1 : 0), 0, cd);
    const where = `${target.deptNm} ${pos === 'before' ? '위' : '아래'}`;

    if (sibs.some((s) => s.deptCd === cd)) {
      try {
        await departmentAdminApi.reorder(order);
        message.success(`${dragged.deptNm}을(를) ${where}로 옮겼습니다.`);
        await qc.invalidateQueries({ queryKey: ['admin-departments'] });
      } catch (e: unknown) {
        message.error(errMsg(e));
      }
      return;
    }

    // 다른 줄 — 상위 부서가 바뀌므로 한 번 묻는다
    const newParent = sibs === tree ? null : target.upDeptCd;
    const parentNm = newParent == null ? '최상위' : `${depts.find((d) => d.deptCd === newParent)?.deptNm ?? ''} 아래`;
    Modal.confirm({
      title: `${dragged.deptNm}을(를) 옮길까요?`,
      content: `상위 부서가 바뀝니다 — ${parentNm}로 옮겨 ${where}에 둡니다. 하위 부서도 함께 따라갑니다.`,
      okText: '옮기기',
      cancelText: '취소',
      onOk: async () => {
        try {
          const res = await departmentAdminApi.move([cd], newParent);
          if (res.skipped.length) { report(res, ''); return; }
          await departmentAdminApi.reorder(order);
          message.success(`${dragged.deptNm}을(를) ${parentNm}로 옮겼습니다.`);
          await refresh();
        } catch (e: unknown) {
          message.error(errMsg(e));
        }
      },
    });
  };

  const openMoveParent = (deptCds: number[]) => { setMoveTo(undefined); setMoving({ mode: 'parent', deptCds }); };
  const openMoveChildren = (parent: AdminDepartment) => { setMoveDepts([]); setMoving({ mode: 'children', parent }); };

  // 기존 부서 가져오기 후보 = 사용 중인 부서 중 나 자신·내 상위·이미 내 바로 아래인 부서를 뺀 것. 지금 위치를 같이 보여 준다
  const childCandidates = useMemo(() => {
    if (moving?.mode !== 'children') return [];
    const p = moving.parent;
    const ancestors = ancestorsOf(depts, p.deptCd);
    return depts.filter((d) => d.inUse && d.deptCd !== p.deptCd && !ancestors.has(d.deptCd) && d.upDeptCd !== p.deptCd)
      .map((d) => ({ value: d.deptCd, label: `${deptLabel(d)} — 지금: ${d.upDeptNm ?? '최상위'}` }));
  }, [moving, depts]);

  const submitMove = async () => {
    if (!moving) return;
    let deptCds: number[];
    let upDeptCd: number | null;
    if (moving.mode === 'parent') {
      if (moveTo === undefined) { message.warning('옮길 위치(상위 부서)를 고르세요.'); return; }
      deptCds = moving.deptCds;
      upDeptCd = moveTo === TOP ? null : moveTo;
    } else {
      if (!moveDepts.length) { message.warning(`${moving.parent.deptNm} 아래로 가져올 부서를 고르세요.`); return; }
      deptCds = moveDepts;
      upDeptCd = moving.parent.deptCd;
    }
    setBusy(true);
    try {
      const target = upDeptCd == null ? '최상위로' : `${depts.find((d) => d.deptCd === upDeptCd)?.deptNm ?? ''} 아래로`;
      report(await departmentAdminApi.move(deptCds, upDeptCd), `${target} 옮겼습니다`);
      setMoving(null);
      if (moving.mode === 'parent') setSelected([]);
      await refresh();
    } catch (e: unknown) {
      message.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const openCreate = (upDeptCd: number | null) => setEditing({ mode: 'create', upDeptCd });
  const openRename = (dept: AdminDepartment) => setEditing({ mode: 'rename', dept });
  // 창이 닫히면 폼이 사라지므로(destroyOnHidden) 열 때마다 initialValues 로 새로 채워진다
  const initialValues = !editing ? undefined
    : editing.mode === 'create' ? { upDeptCd: editing.upDeptCd ?? undefined } : { deptNm: editing.dept.deptNm };

  const submit = async () => {
    if (!editing) return;
    const v = await form.validateFields();
    setBusy(true);
    try {
      if (editing.mode === 'create') {
        await departmentAdminApi.create({ deptNm: v.deptNm.trim(), upDeptCd: v.upDeptCd ?? null, headEmployeeNo: v.headEmployeeNo ?? null });
        message.success(`${v.deptNm.trim()} 부서를 추가했습니다.`);
      } else {
        await departmentAdminApi.rename(editing.dept.deptCd, v.deptNm.trim());
        message.success('부서 이름을 바꿨습니다.');
      }
      setEditing(null);
      await refresh();
    } catch (e: unknown) {
      message.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnsType<Row> = [
    {
      title: '부서', dataIndex: 'deptNm', width: 330,
      render: (v: string, r) => (
        <Space size={6}>
          {!flat && r.inUse && (
            <Tooltip title="끌어서 순서·위치 바꾸기" mouseEnterDelay={0.6}>
              <span className="dept-drag-handle" draggable
                onDragStart={(e) => {
                  setDragCd(r.deptCd);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', String(r.deptCd));
                  const tr = (e.currentTarget as HTMLElement).closest('tr');
                  if (tr) e.dataTransfer.setDragImage(tr, 24, 16);
                }}
                onDragEnd={() => { setDragCd(null); setDropHint(null); }}>
                <HolderOutlined />
              </span>
            </Tooltip>
          )}
          <ApartmentOutlined style={{ color: !r.inUse ? T.t4 : r.depth === 0 ? T.primary : T.t4 }} />
          <span style={{ fontWeight: r.depth === 0 ? 600 : 500, color: r.inUse ? T.t1 : T.t4 }}>{v}</span>
          {!r.manual && <Text type="secondary" style={{ fontSize: 11 }}>{r.deptCd}</Text>}
          {r.manual && (
            <Tooltip title="ERP 에 없는 묶음 부서라 부서 코드가 없습니다. 사람은 들어가지 않고 하위 부서와 부서장만 둡니다.">
              <Tag color="blue" style={{ marginInlineEnd: 0 }}>직접 추가</Tag>
            </Tooltip>
          )}
          {!r.inUse && <Tag style={{ marginInlineEnd: 0 }}>미사용</Tag>}
          {kw && (r.members ?? []).filter((m) => m.name.toLowerCase().includes(kw) || m.employeeNo.includes(kw)).map((m) => (
            <Tag key={m.employeeNo} color="gold" style={{ marginInlineEnd: 0 }}>{m.name} {m.jobTitle}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '인원', dataIndex: 'headcount', width: 70, align: 'right',
      render: (v: number, r) => {
        const members = r.members ?? [];
        if (!v || !members.length) return v ? `${v}명` : <Text type="secondary">-</Text>;
        return (
          <Popover placement="rightTop" mouseEnterDelay={0.2} title={`${r.deptNm} · 재직 ${members.length}명`}
            content={(
              <div style={{ maxHeight: 320, overflowY: 'auto', minWidth: 200 }}>
                {members.map((m) => (
                  <div key={m.employeeNo} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '3px 0' }}>
                    <span style={{ fontWeight: m.jobTitle === '매니저' ? 400 : 600, color: T.t1 }}>{m.name} <span style={{ color: T.t3, fontWeight: 400 }}>{m.jobTitle}</span></span>
                    <Text type="secondary" style={{ fontSize: 12 }}>{m.employeeNo}</Text>
                  </div>
                ))}
              </div>
            )}>
            <a style={{ borderBottom: `1px dashed ${T.t4}` }}>{v}명</a>
          </Popover>
        );
      },
    },
    {
      title: '상위 부서', key: 'parent', width: 300,
      render: (_, r) => (
        <Select<number> allowClear showSearch size="small" style={{ width: '100%' }} placeholder="최상위 (상위 부서 없음)"
          value={r.upDeptCd ?? undefined} loading={saving === r.deptCd} disabled={!r.inUse}
          options={parentOptionsFor(r)}
          filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())}
          onChange={(v) => setParent(r, v ?? null)} />
      ),
    },
    {
      title: '부서장', key: 'head', width: 240,
      render: (_, r) => (
        <Select<string> allowClear showSearch size="small" style={{ width: '100%' }} placeholder="없음 (직책으로 판단)"
          value={r.headEmployeeNo ?? undefined} loading={saving === r.deptCd} options={headOptions} disabled={!r.inUse}
          filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())}
          onChange={(v) => setHead(r, v ?? null)} />
      ),
    },
    {
      title: '관리', key: 'actions', width: 230,
      render: (_, r) => (
        <Space size={0} wrap>
          {r.inUse && (
            <Dropdown trigger={['click']} menu={{
              items: [
                { key: 'new', label: '새 부서 만들기' },
                { key: 'existing', label: '기존 부서 가져오기' },
              ],
              onClick: ({ key }) => (key === 'new' ? openCreate(r.deptCd) : openMoveChildren(r)),
            }}>
              <Button type="link" size="small">하위 추가 <DownOutlined style={{ fontSize: 10 }} /></Button>
            </Dropdown>
          )}
          {r.manual && <Button type="link" size="small" onClick={() => openRename(r)}>이름 변경</Button>}
          {r.inUse
            ? (
              <Popconfirm title={`${r.deptNm}을(를) 미사용으로 둘까요?`} description="트리와 부서 선택 목록에서 숨깁니다. 언제든 다시 사용으로 돌릴 수 있습니다."
                okText="미사용" cancelText="취소" onConfirm={() => setInUse([r.deptCd], false)}>
                <Button type="link" size="small" style={{ color: T.t3 }}>미사용</Button>
              </Popconfirm>
            )
            : <Button type="link" size="small" onClick={() => setInUse([r.deptCd], true)}>다시 사용</Button>}
          {r.manual && (
            <Popconfirm title={`${r.deptNm}을(를) 지울까요?`} description="하위 부서가 없을 때만 지워집니다." okText="삭제" okButtonProps={{ danger: true }} cancelText="취소"
              onConfirm={() => remove(r)}>
              <Button type="link" size="small" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <PageLayout>
      <style>{`
        .dept-drag-handle { cursor: grab; color: ${T.t4}; padding: 0 2px; }
        .dept-drag-handle:hover { color: ${T.primary}; }
        .dept-drop-before > td { box-shadow: inset 0 2px 0 ${T.primary}; }
        .dept-drop-after > td { box-shadow: inset 0 -2px 0 ${T.primary}; }
      `}</style>
      <PageHeader title="부서 관리" sub="상위 부서를 이어 조직도를 만들고 부서장(본부장·팀장)을 지정합니다. 부서 이름 왼쪽 ⋮⋮ 를 끌어 순서·위치를 바꿀 수 있습니다. ERP 에 없는 묶음 부서는 [부서 추가]로 만들고, 안 쓰는 옛 부서는 미사용으로 숨깁니다."
        actions={(
          <Space>
            <Space size={6}>
              <Switch size="small" checked={showUnused} onChange={setShowUnused} />
              <Text style={{ fontSize: 13 }}>미사용 부서 보기{unusedCount ? ` (${unusedCount})` : ''}</Text>
            </Space>
            <Input.Search allowClear placeholder="부서명 · 코드 · 사람 이름" style={{ width: 220 }} onSearch={setQ} onChange={(e) => !e.target.value && setQ('')} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(null)}>부서 추가</Button>
          </Space>
        )} />

      {rootsWithoutParent > 10 && (
        <Alert type="warning" showIcon style={{ marginBottom: 12, borderRadius: 8 }}
          message={`상위 부서가 없는 부서가 ${rootsWithoutParent}개입니다. 본부·팀·파트가 이어지도록 상위 부서를 지정하세요.`} />
      )}

      {selected.length > 0 && (
        <Space style={{ marginBottom: 8 }}>
          <Text strong>{selected.length}개 선택</Text>
          <Button size="small" type="primary" ghost loading={busy} onClick={() => openMoveParent(selected)}>상위 부서 지정</Button>
          <Popconfirm title={`선택한 ${selected.length}개 부서를 미사용으로 둘까요?`} description="재직자가 있거나 사용 중인 하위 부서가 남는 부서는 건너뜁니다."
            okText="미사용" cancelText="취소" onConfirm={() => setInUse(selected, false)}>
            <Button size="small" loading={busy}>미사용으로</Button>
          </Popconfirm>
          <Button size="small" loading={busy} onClick={() => setInUse(selected, true)}>다시 사용</Button>
          <Button size="small" type="link" onClick={() => setSelected([])}>선택 해제</Button>
        </Space>
      )}

      <Card variant="borderless" style={{ borderRadius: 12, border: `1px solid ${T.border2}` }} styles={{ body: { padding: 0 } }}>
        <Table<Row> rowKey="key" size="small" columns={columns} dataSource={flat ?? tree} loading={isFetching} pagination={false}
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as number[]), checkStrictly: true }}
          rowClassName={(r) => (dropHint?.cd === r.deptCd ? `dept-drop-${dropHint.pos}` : '')}
          onRow={(r) => ({
            onDragOver: (e) => {
              if (flat || !canDropOn(r)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const rect = e.currentTarget.getBoundingClientRect();
              const pos: DropPos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
              if (dropHint?.cd !== r.deptCd || dropHint.pos !== pos) setDropHint({ cd: r.deptCd, pos });
            },
            onDrop: (e) => {
              if (flat || !canDropOn(r)) return;
              e.preventDefault();
              void dropOn(r, dropHint?.cd === r.deptCd ? dropHint.pos : 'before');
            },
          })}
          expandable={flat ? undefined : { defaultExpandAllRows: true, indentSize: 18 }}
          scroll={{ y: 'calc(100vh - 300px)' }} />
      </Card>
      <Space style={{ marginTop: 8 }}>
        <Button type="link" size="small" onClick={() => qc.invalidateQueries({ queryKey: ['admin-departments'] })}>새로고침</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>사용 중 {depts.length - unusedCount}개 · 최상위 {rootsWithoutParent}개 · 미사용 {unusedCount}개</Text>
      </Space>

      <Modal title={editing?.mode === 'rename' ? `이름 변경 — ${editing.dept.deptNm}` : '부서 추가'} open={!!editing} onCancel={() => setEditing(null)} onOk={submit}
        okText={editing?.mode === 'rename' ? '저장' : '추가'} cancelText="취소" confirmLoading={busy} destroyOnHidden width={520}>
        {editing?.mode === 'create' && (
          <Alert type="info" showIcon style={{ margin: '12px 0', borderRadius: 8 }}
            message="ERP 에 없는 묶음 부서(예: 본부)를 만듭니다. 사람은 매일 ERP 동기화가 ERP 부서로 되돌리므로, 여기서 만든 부서에는 하위 부서를 넣고 부서장을 지정하세요." />
        )}
        <Form form={form} layout="vertical" initialValues={initialValues} style={{ marginTop: editing?.mode === 'create' ? 0 : 12 }}>
          <Form.Item name="deptNm" label="부서명" rules={[{ required: true, whitespace: true, message: '부서명을 입력해주세요.' }, { max: 100, message: '100자 이내로 입력해주세요.' }]}>
            <Input placeholder="예: 그래픽스사업본부" autoFocus />
          </Form.Item>
          {editing?.mode === 'create' && (
            <>
              <Form.Item name="upDeptCd" label="상위 부서" extra="비우면 최상위 부서가 됩니다.">
                <Select<number> allowClear showSearch placeholder="최상위 (상위 부서 없음)" options={parentOptions.filter((o) => !o.disabled)}
                  filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
              </Form.Item>
              <Form.Item name="headEmployeeNo" label="부서장" extra="나중에 목록에서 지정해도 됩니다.">
                <Select<string> allowClear showSearch placeholder="없음" options={headOptions}
                  filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <Modal open={!!moving} onCancel={() => setMoving(null)} onOk={submitMove} okText="옮기기" cancelText="취소" confirmLoading={busy} destroyOnHidden width={560}
        title={moving?.mode === 'children' ? `${moving.parent.deptNm} 아래로 기존 부서 가져오기` : `선택한 ${moving?.mode === 'parent' ? moving.deptCds.length : 0}개 부서 옮기기`}>
        {moving?.mode === 'parent' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6, color: T.t2 }}>
              옮길 부서: {moving.deptCds.map((cd) => depts.find((d) => d.deptCd === cd)?.deptNm ?? cd).join(', ')}
            </div>
            <Select<number> showSearch style={{ width: '100%' }} placeholder="어디 아래로 옮길까요? (상위 부서)" value={moveTo} onChange={setMoveTo}
              options={[
                { value: TOP, label: '최상위 (상위 부서 없음)' },
                ...parentOptions.filter((o) => !o.disabled && !moving.deptCds.includes(o.value)),
              ]}
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
            <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
              하위 부서는 함께 따라갑니다. 자기 하위 부서 아래로는 옮길 수 없습니다(그런 부서는 건너뜁니다).
            </Text>
          </div>
        )}
        {moving?.mode === 'children' && (
          <div style={{ marginTop: 12 }}>
            <Select<number[]> mode="multiple" showSearch style={{ width: '100%' }} placeholder="가져올 부서를 고르세요 (여러 개)" value={moveDepts} onChange={setMoveDepts}
              options={childCandidates} maxTagCount="responsive"
              filterOption={(i, o) => ((o?.label as string) ?? '').toLowerCase().includes(i.toLowerCase())} />
            <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 12 }}>
              고른 부서가 지금 자리에서 빠져 {moving.parent.deptNm} 바로 아래로 들어갑니다. 그 부서의 하위 부서도 함께 따라옵니다.
            </Text>
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
