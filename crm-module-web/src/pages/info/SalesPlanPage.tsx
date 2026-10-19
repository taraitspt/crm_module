import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Card, Col, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, DownloadOutlined, PlusOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { lookupApi } from '@/api/info.api';
import { salesPlanApi } from '@/api/salesPlan.api';
import type { SalesPlanRow } from '@/types/salesPlan';
import MemoButton from '@/components/common/MemoButton';

const { Text } = Typography;

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'] as const;
type MonthCd = typeof MONTHS[number];
type AmtField = 'laborAmt' | 'paperAmt';

const fmtNum = (v: number | undefined | null) =>
  v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0';
const parseNum = (v: string | undefined) => Number(v?.replace(/,/g, '') ?? 0);

const rowKey = (r: SalesPlanRow) => `${r.salesEmpId}|${r.partnerCd}`;
/** 신규 목표용 가상 거래처(NEW, NEW2 …) — ERP 에 없는 자리표시 코드. 서버 SalesPlanService.isVirtualPartner 와 같은 규칙 */
const isVirtual = (cd: string) => cd.toUpperCase().startsWith('NEW');

interface PartnerHit {
  partnerCd: string;
  partnerNm: string;
  bizrNo: string;
}

/**
 * 월매출계획 입력 — 담당자(users) × 거래처(ERP) 행에 1~12월 공임/용지 금액을 입력한다.
 * 저장은 "현재 화면에 로드된 담당자들의 해당 연도 계획을 통째로 교체" 방식이라, 행 삭제도 저장 시 반영된다.
 */
export default function SalesPlanPage() {
  const queryClient = useQueryClient();
  const [year, setYear] = useState(dayjs().year());
  /** 조회 조건 — 부서·담당자 여러 개(사용자 2026-10-19). 선택지는 이 해 계획이 있는 부서·담당자만. 비우면 전체 */
  const [deptCds, setDeptCds] = useState<number[]>([]);
  const [empIds, setEmpIds] = useState<string[]>([]);
  /** 볼 월 — 비우면 1~12월 전체(기본). 고르면 그 월 열만, 그 월에 계획이 있는 거래처만(새로 추가한 행은 항상) */
  const [pickMonths, setPickMonths] = useState<MonthCd[]>([]);
  const shownMonths = useMemo<MonthCd[]>(() => (pickMonths.length ? MONTHS.filter((m) => pickMonths.includes(m)) : [...MONTHS]), [pickMonths]);
  const allMonths = shownMonths.length === MONTHS.length;
  const [rows, setRows] = useState<SalesPlanRow[]>([]);
  /** 로드 시점에 존재하던 담당자 — 행을 전부 지워도 저장 시 교체 대상에 포함시키기 위해 기억 */
  const [loadedEmpIds, setLoadedEmpIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 거래처 추가 모달 — 담당자를 모달 안에서 고른다(상단 필터에 선택돼 있으면 그 값이 기본).
  const [addOpen, setAddOpen] = useState(false);
  const [modalEmpId, setModalEmpId] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [hits, setHits] = useState<PartnerHit[]>([]);
  const [searching, setSearching] = useState(false);

  // 거래처 추가 창의 담당자 = 활성 사용자 전체(아직 계획이 없는 사람도 새로 넣을 수 있어야 한다)
  const { data: users } = useQuery({
    queryKey: ['sales-plan-users', 'all'],
    queryFn: () => salesPlanApi.getUsers(undefined),
  });
  const modalUserOptions = useMemo(
    () => (users ?? []).map((u) => ({ value: u.id, label: u.deptNm ? `${u.name} (${u.deptNm})` : u.name })),
    [users],
  );
  const modalUser = useMemo(() => (users ?? []).find((u) => u.id === modalEmpId), [users, modalEmpId]);

  // 그 해 계획 전체를 받고(데이터 범위는 서버가 적용) 부서·담당자는 화면에서 거른다
  const { data, isLoading } = useQuery({
    queryKey: ['sales-plan', year],
    queryFn: () => salesPlanApi.getPlans(String(year)),
  });

  useEffect(() => {
    if (!data) return;
    setRows(data.map((r) => ({ ...r, months: r.months.map((m) => ({ ...m })) })));
    setLoadedEmpIds(Array.from(new Set(data.map((r) => r.salesEmpId))));
    setDirty(false);
  }, [data]);

  const updateCell = (key: string, mm: MonthCd, field: AmtField, value: number | null) => {
    setRows((prev) => prev.map((r) => {
      if (rowKey(r) !== key) return r;
      return { ...r, months: r.months.map((m) => (m.planMm === mm ? { ...m, [field]: value ?? 0 } : m)) };
    }));
    setDirty(true);
  };

  /** 매출 이월/증감 사유(월 메모) — 금액처럼 화면에서 고치고 [저장]으로 같이 저장된다 */
  const updateMemo = (key: string, mm: MonthCd, memo: string) => {
    setRows((prev) => prev.map((r) => (rowKey(r) !== key ? r
      : { ...r, months: r.months.map((m) => (m.planMm === mm ? { ...m, memo: memo || null } : m)) })));
    setDirty(true);
  };

  const monthTotal = (r: SalesPlanRow, mm: MonthCd) => {
    const m = r.months.find((x) => x.planMm === mm);
    return (m?.laborAmt ?? 0) + (m?.paperAmt ?? 0);
  };
  /** 행 합계 — 보이는 월(shownMonths)만 더한다 */
  const rowTotal = (r: SalesPlanRow, field?: AmtField) =>
    r.months.filter((m) => shownMonths.includes(m.planMm as MonthCd))
      .reduce((s, m) => s + (field ? (m[field] ?? 0) : (m.laborAmt ?? 0) + (m.paperAmt ?? 0)), 0);

  const passes = (r: SalesPlanRow) =>
    (!deptCds.length || (r.deptCd != null && deptCds.includes(r.deptCd)))
    && (!empIds.length || empIds.includes(r.salesEmpId));
  // 월을 고르면 "조회해 온 값" 기준으로 그 월 계획이 0원인 거래처를 뺀다. 입력 중인 값으로 판단하면
  // 금액을 지우거나 0으로 고치는 순간 줄이 사라져서(사용자 확인 2026-10-19), 조회 시점 값으로만 거른다. 새로 추가한 행은 항상 보인다.
  const hiddenByMonth = useMemo(() => {
    const set = new Set<string>();
    if (allMonths) return set;
    (data ?? []).forEach((r) => {
      if (!shownMonths.some((mm) => monthTotal(r, mm) > 0)) set.add(rowKey(r));
    });
    return set;
  }, [data, shownMonths, allMonths]);
  const visibleRows = useMemo(() => rows.filter((r) => passes(r) && !hiddenByMonth.has(rowKey(r))),
    [rows, deptCds, empIds, hiddenByMonth]);
  // 선택지 — 지금 화면의 행(새로 추가한 행 포함)에 있는 부서·담당자만. 담당자는 고른 부서 안에서
  const deptOptions = useMemo(() => {
    const m = new Map<number, string>();
    rows.forEach((r) => { if (r.deptCd != null) m.set(r.deptCd, r.deptNm || String(r.deptCd)); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko')).map(([value, label]) => ({ value, label }));
  }, [rows]);
  const userOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (deptCds.length && (r.deptCd == null || !deptCds.includes(r.deptCd))) return;
      m.set(r.salesEmpId, r.deptNm ? `${r.empNm} (${r.deptNm})` : r.empNm);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ko')).map(([value, label]) => ({ value, label }));
  }, [rows, deptCds]);

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => rowKey(r) !== key));
    setDirty(true);
  };

  /** 하단 합계 — 전체 행의 월별 공임/용지/합계와 연합계. */
  const totals = useMemo(() => {
    const byMonth = shownMonths.map((mm) => {
      const labor = visibleRows.reduce((s, r) => s + (r.months.find((x) => x.planMm === mm)?.laborAmt ?? 0), 0);
      const paper = visibleRows.reduce((s, r) => s + (r.months.find((x) => x.planMm === mm)?.paperAmt ?? 0), 0);
      return { mm, labor, paper, sum: labor + paper };
    });
    const labor = byMonth.reduce((s, m) => s + m.labor, 0);
    const paper = byMonth.reduce((s, m) => s + m.paper, 0);
    return { byMonth, labor, paper, sum: labor + paper };
  }, [visibleRows, shownMonths]);

  const searchPartners = async (kw: string) => {
    setSearching(true);
    try {
      const list = await lookupApi.searchPartners(kw.trim());
      setHits(list.map((p) => ({ partnerCd: p.partnerCd, partnerNm: p.partnerNm, bizrNo: p.bizrNo })));
    } catch {
      message.error('거래처 검색에 실패했습니다. (ERP 연결 확인)');
    } finally {
      setSearching(false);
    }
  };

  /** 모달 열기 — 담당자 기본값은 상단 필터 선택값, 없으면 사용자가 한 명뿐일 때 그 사람. 목록은 바로 조회. */
  const openAdd = () => {
    setModalEmpId(empIds.length === 1 ? empIds[0] : '');
    setKeyword('');
    setHits([]);
    setAddOpen(true);
    void searchPartners('');
  };

  /**
   * 신규(목표) — ERP 에 없는 신규 거래처 매출 목표를 담당자당 한 줄(가상 코드 NEW)로 몰아 넣는다(사용자 2026-10-19).
   * 실적은 매출현황에서 "그 담당자의, 계획에 없는 거래처 매출"로 붙는다.
   */
  const NEW_PARTNER: PartnerHit = { partnerCd: 'NEW', partnerNm: '신규(목표)', bizrNo: '' };
  const hasNewRow = modalUser != null && rows.some((x) => x.salesEmpId === modalUser.id && isVirtual(x.partnerCd));

  const addPartner = (p: PartnerHit) => {
    if (!modalUser) {
      message.warning('담당자를 먼저 선택하세요.');
      return;
    }
    const key = `${modalUser.id}|${p.partnerCd}`;
    if (rows.some((r) => rowKey(r) === key)) {
      message.warning('이미 추가된 거래처입니다.');
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        salesEmpId: modalUser.id,
        empNm: modalUser.name,
        deptCd: modalUser.deptCd,
        deptNm: modalUser.deptNm,
        partnerCd: p.partnerCd,
        partnerNm: p.partnerNm,
        months: MONTHS.map((mm) => ({ planMm: mm, laborAmt: 0, paperAmt: 0 })),
      },
    ]);
    // 조회 조건에 걸려 새 행이 안 보이면 그 부서·담당자를 조건에 더한다
    if (deptCds.length && modalUser.deptCd != null && !deptCds.includes(modalUser.deptCd)) setDeptCds([...deptCds, modalUser.deptCd]);
    if (empIds.length && !empIds.includes(modalUser.id)) setEmpIds([...empIds, modalUser.id]);
    setDirty(true);
    message.success(`${p.partnerNm} 추가됨 — 금액 입력 후 저장하세요.`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 저장은 "담당자의 그 해 계획을 통째로 교체"라, 조회 조건으로 좁혀 둔 상태면 그 담당자들만 보낸다 —
      // 화면에 안 보이는 다른 사람 계획을 (다른 사람이 동시에 고친 것까지) 덮어쓰지 않게.
      const loadedDept = new Map((data ?? []).map((r) => [r.salesEmpId, r.deptCd] as const));
      const target = new Set<string>([
        ...loadedEmpIds.filter((id) => passes({ salesEmpId: id, deptCd: loadedDept.get(id) ?? null } as SalesPlanRow)),
        ...visibleRows.map((r) => r.salesEmpId),
      ]);
      await salesPlanApi.save({ planYy: String(year), salesEmpIds: [...target], rows: rows.filter((r) => target.has(r.salesEmpId)) });
      await queryClient.invalidateQueries({ queryKey: ['sales-plan'], refetchType: 'active' });
      message.success('저장되었습니다.');
    } catch {
      message.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    const header1: (string | number)[] = ['부서', '담당자', '거래처코드', '거래처명'];
    const header2: (string | number)[] = ['', '', '', ''];
    shownMonths.forEach((mm) => {
      header1.push(`${parseInt(mm, 10)}월`, '', '');
      header2.push('공임', '용지', '합계');
    });
    header1.push(allMonths ? '연합계' : '선택 월 합계', '', '');
    header2.push('공임', '용지', '합계');
    const aoa: (string | number)[][] = [header1, header2];
    visibleRows.forEach((r) => {
      const line: (string | number)[] = [r.deptNm ?? '', r.empNm, r.partnerCd, r.partnerNm ?? ''];
      shownMonths.forEach((mm) => {
        const m = r.months.find((x) => x.planMm === mm);
        line.push(m?.laborAmt ?? 0, m?.paperAmt ?? 0, monthTotal(r, mm));
      });
      line.push(rowTotal(r, 'laborAmt'), rowTotal(r, 'paperAmt'), rowTotal(r));
      aoa.push(line);
    });
    // 화면 하단 합계와 동일한 합계 행
    if (visibleRows.length > 0) {
      const sumLine: (string | number)[] = [`합계 (${visibleRows.length}건)`, '', '', ''];
      totals.byMonth.forEach((m) => sumLine.push(m.labor, m.paper, m.sum));
      sumLine.push(totals.labor, totals.paper, totals.sum);
      aoa.push(sumLine);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const merges: XLSX.Range[] = [];
    for (let i = 0; i < 4; i += 1) merges.push({ s: { r: 0, c: i }, e: { r: 1, c: i } });
    for (let i = 0; i < shownMonths.length + 1; i += 1) merges.push({ s: { r: 0, c: 4 + i * 3 }, e: { r: 0, c: 6 + i * 3 } });
    ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '월매출계획');
    // 매출 이월/증감 사유(월 메모)는 별도 시트
    const memoAoa: (string | number)[][] = [['부서', '담당자', '거래처코드', '거래처명', '월', '매출 이월/증감 사유']];
    visibleRows.forEach((r) => r.months.forEach((m) => {
      if (m.memo && shownMonths.includes(m.planMm as MonthCd)) memoAoa.push([r.deptNm ?? '', r.empNm, r.partnerCd, r.partnerNm ?? '', `${parseInt(m.planMm, 10)}월`, m.memo]);
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(memoAoa), '매출 이월·증감 사유');
    XLSX.writeFile(wb, `월매출계획_${year}년.xlsx`);
  };

  const amtCell = (field: AmtField) => (_: unknown, r: SalesPlanRow, mm: MonthCd) => (
    <InputNumber
      size="small"
      value={r.months.find((x) => x.planMm === mm)?.[field] ?? 0}
      onChange={(v) => updateCell(rowKey(r), mm, field, v)}
      formatter={fmtNum}
      parser={parseNum}
      min={0}
      controls={false}
      style={{ width: '100%' }}
    />
  );

  const columns: ColumnsType<SalesPlanRow> = [
    { title: '부서', key: 'dept', width: 100, fixed: 'left', render: (_, r) => r.deptNm ?? '-' },
    { title: '담당자', key: 'emp', width: 90, fixed: 'left', render: (_, r) => r.empNm },
    { title: '거래처', key: 'partnerCd', width: 80, fixed: 'left',
      render: (_, r) => (isVirtual(r.partnerCd) ? <Tag color="gold" style={{ marginInlineEnd: 0 }}>신규</Tag> : <Text type="secondary">{r.partnerCd}</Text>) },
    { title: '거래처명', key: 'partnerNm', width: 160, fixed: 'left', ellipsis: true,
      render: (_, r) => r.partnerNm ?? '-' },
    ...shownMonths.map((mm) => ({
      title: `${parseInt(mm, 10)}월`,
      key: `m${mm}`,
      children: [
        { title: '공임', key: `m${mm}l`, width: 100, align: 'right' as const, render: (_: unknown, r: SalesPlanRow) => amtCell('laborAmt')(_, r, mm) },
        { title: '용지', key: `m${mm}p`, width: 100, align: 'right' as const, render: (_: unknown, r: SalesPlanRow) => amtCell('paperAmt')(_, r, mm) },
        { title: '합계', key: `m${mm}t`, width: 100, align: 'right' as const, render: (_: unknown, r: SalesPlanRow) => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MemoButton
              memo={r.months.find((x) => x.planMm === mm)?.memo}
              onSave={(m) => updateMemo(rowKey(r), mm, m)}
            />
            <Text className="tabular-nums">{fmtNum(monthTotal(r, mm))}</Text>
          </span>
        ) },
      ],
    })),
    {
      title: allMonths ? '연합계' : '선택 월 합계',
      key: 'total',
      fixed: 'right',
      children: [
        { title: '공임', key: 'tl', width: 110, align: 'right' as const, render: (_: unknown, r: SalesPlanRow) => <Text className="tabular-nums">{fmtNum(rowTotal(r, 'laborAmt'))}</Text> },
        { title: '용지', key: 'tp', width: 110, align: 'right' as const, render: (_: unknown, r: SalesPlanRow) => <Text className="tabular-nums">{fmtNum(rowTotal(r, 'paperAmt'))}</Text> },
        { title: '합계', key: 'tt', width: 120, align: 'right' as const, render: (_: unknown, r: SalesPlanRow) => <Text strong style={{ color: '#1e40af' }} className="tabular-nums">{fmtNum(rowTotal(r))}</Text> },
      ],
    },
    {
      title: '',
      key: 'del',
      width: 44,
      fixed: 'right',
      render: (_, r) => (
        <Popconfirm title="이 거래처 행을 삭제할까요? (저장 시 반영)" onConfirm={() => removeRow(rowKey(r))}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <PageLayout>
      <PageHeader title="월매출계획" />

      <Card variant="borderless" styles={{ body: { padding: '12px 16px' } }} style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #f1f5f9' }}>
        <Row gutter={12} align="middle">
          <Col>
            <Select value={year} onChange={(v) => setYear(v)} style={{ width: 100 }}
              options={[year - 2, year - 1, year, year + 1, year + 2].filter((y, i, a) => a.indexOf(y) === i).sort().map((y) => ({ value: y, label: `${y}년` }))} />
          </Col>
          <Col>
            <Select mode="multiple" allowClear showSearch maxTagCount="responsive" placeholder="부서 전체" value={deptCds} options={deptOptions} style={{ width: 220 }}
              onChange={(v: number[]) => { setDeptCds(v); setEmpIds([]); }}
              filterOption={(input, opt) => ((opt?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Col>
          <Col>
            <Select mode="multiple" allowClear showSearch maxTagCount="responsive" placeholder="담당자 전체" value={empIds} options={userOptions} style={{ width: 240 }}
              onChange={(v: string[]) => setEmpIds(v)}
              filterOption={(input, opt) => ((opt?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Col>
          <Col>
            <Select mode="multiple" allowClear maxTagCount="responsive" placeholder="1~12월 전체" value={pickMonths} style={{ width: 200 }}
              options={MONTHS.map((m) => ({ value: m, label: `${parseInt(m, 10)}월` }))}
              onChange={(v: MonthCd[]) => setPickMonths(v)} />
          </Col>
          <Col style={{ marginLeft: 'auto' }}>
            <Space>
              {dirty && <Text type="warning" style={{ fontSize: 12 }}>저장되지 않은 변경이 있습니다</Text>}
              <Button icon={<PlusOutlined />} onClick={openAdd}>거래처 추가</Button>
              <Button icon={<DownloadOutlined />} onClick={handleDownloadExcel} disabled={visibleRows.length === 0}>엑셀다운로드</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave} disabled={!dirty}>저장</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Table<SalesPlanRow>
        className="amount-grid"
        columns={columns}
        dataSource={visibleRows}
        loading={isLoading}
        rowKey={rowKey}
        pagination={false}
        size="small"
        bordered
        // 가로 폭 = 보이는 열 합(왼쪽 4열 430 + 월마다 300 + 합계 340 + 삭제 44). 고정값(4400)이면 월을 골랐을 때 남는 폭이 합계 열로 몰려 담당자·월 열이 밀려났다
        scroll={{ x: 430 + shownMonths.length * 300 + 340 + 44, y: 'calc(100vh - 300px)' }}
        locale={{ emptyText: '“거래처 추가” 버튼으로 담당자와 거래처를 골라 행을 만드세요.' }}
        summary={() => {
          if (visibleRows.length === 0) return null;
          // 합계 셀은 leaf 컬럼 순서대로: [부서·담당자·거래처·거래처명](4) → 보이는 월 × 3 → 연합계 3 → 삭제 1
          const cells = [
            <Table.Summary.Cell key="label" index={0} colSpan={4}>
              <Text strong>합계 ({visibleRows.length}건)</Text>
            </Table.Summary.Cell>,
          ];
          let idx = 4;
          totals.byMonth.forEach((m) => {
            cells.push(
              <Table.Summary.Cell key={`${m.mm}l`} index={idx++} align="right">
                <Text className="tabular-nums">{fmtNum(m.labor)}</Text>
              </Table.Summary.Cell>,
              <Table.Summary.Cell key={`${m.mm}p`} index={idx++} align="right">
                <Text className="tabular-nums">{fmtNum(m.paper)}</Text>
              </Table.Summary.Cell>,
              <Table.Summary.Cell key={`${m.mm}t`} index={idx++} align="right">
                <Text strong className="tabular-nums">{fmtNum(m.sum)}</Text>
              </Table.Summary.Cell>,
            );
          });
          cells.push(
            <Table.Summary.Cell key="tl" index={idx++} align="right">
              <Text className="tabular-nums">{fmtNum(totals.labor)}</Text>
            </Table.Summary.Cell>,
            <Table.Summary.Cell key="tp" index={idx++} align="right">
              <Text className="tabular-nums">{fmtNum(totals.paper)}</Text>
            </Table.Summary.Cell>,
            <Table.Summary.Cell key="tt" index={idx++} align="right">
              <Text strong style={{ color: '#1e40af' }} className="tabular-nums">{fmtNum(totals.sum)}</Text>
            </Table.Summary.Cell>,
            <Table.Summary.Cell key="del" index={idx++} />,
          );
          return (
            <Table.Summary fixed>
              <Table.Summary.Row className="amount-grid-summary">{cells}</Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />

      <Modal
        title="거래처 추가"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        footer={<Button onClick={() => setAddOpen(false)}>닫기</Button>}
        width={680}
      >
        <Select
          showSearch
          placeholder="담당자 선택"
          value={modalEmpId || undefined}
          options={modalUserOptions}
          onChange={(v) => setModalEmpId(v ?? '')}
          style={{ width: '100%', marginBottom: 8 }}
          filterOption={(input, opt) => ((opt?.label as string) ?? '').toLowerCase().includes(input.toLowerCase())}
          notFoundContent="사용자가 없습니다. 관리자 → ERP 동기화로 사원을 먼저 받아오세요."
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px dashed #e5c07b', background: '#fffbeb', borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 12 }}>
            <Text strong style={{ fontSize: 12 }}>신규(목표)</Text>
            <Text type="secondary" style={{ fontSize: 12 }}> — ERP에 없는 신규 거래처 목표는 한 줄로 모아 입력합니다.</Text>
          </div>
          <Button size="small" icon={hasNewRow ? undefined : <PlusOutlined />} disabled={hasNewRow} onClick={() => addPartner(NEW_PARTNER)}>
            {hasNewRow ? '추가됨' : '신규(목표) 추가'}
          </Button>
        </div>
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input placeholder="거래처명 / 코드 / 사업자번호" value={keyword} onChange={(e) => setKeyword(e.target.value)} onPressEnter={() => searchPartners(keyword)} allowClear />
          <Button type="primary" icon={<SearchOutlined />} loading={searching} onClick={() => searchPartners(keyword)}>검색</Button>
        </Space.Compact>
        <Table<PartnerHit>
          size="small"
          rowKey="partnerCd"
          dataSource={hits}
          loading={searching}
          pagination={{ pageSize: 8, size: 'small' }}
          columns={[
            { title: '코드', dataIndex: 'partnerCd', width: 90 },
            { title: '거래처명', dataIndex: 'partnerNm' },
            { title: '사업자번호', dataIndex: 'bizrNo', width: 130 },
            {
              title: '',
              key: 'add',
              width: 70,
              render: (_, p) => {
                const added = modalUser != null && rows.some((r) => rowKey(r) === `${modalUser.id}|${p.partnerCd}`);
                return (
                  <Button size="small" type={added ? 'text' : 'default'} disabled={added} onClick={() => addPartner(p)}>
                    {added ? '추가됨' : '추가'}
                  </Button>
                );
              },
            },
          ]}
          locale={{ emptyText: '검색어를 입력하고 검색하세요 (ERP 거래처 마스터)' }}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          여러 거래처를 이어서 추가할 수 있습니다. 닫은 뒤 금액을 입력하고 저장하세요.
        </Text>
      </Modal>
    </PageLayout>
  );
}
