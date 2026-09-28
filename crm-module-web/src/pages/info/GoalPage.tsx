import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import {
  Button, InputNumber, Table, message, Select, Row, Col, Card,
  Typography, Space, Pagination,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SaveOutlined, DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import PageLayout from '@/components/layout/PageLayout';
import PageHeader from '@/components/layout/PageHeader';
import { goalApi, lookupApi } from '@/api/info.api';
import type { AmGoalYearlyItem } from '@/types/info';
import dayjs from 'dayjs';

const { Text } = Typography;

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'] as const;
type MonthCd = typeof MONTHS[number];

const fmtNum = (v: number | undefined | null) =>
  v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0';

const parseNum = (v: string | undefined) =>
  Number(v?.replace(/,/g, '') ?? 0);

type Field = 'goalAmt' | 'innerAmt';

interface FlatRow {
  key: string;
  salesEmpId: string;
  empNm: string;
  deptCd: string;
  deptNm: string;
  field: Field | 'outerAmt';
  /** 부서명/담당자명 컬럼의 rowSpan (영업담당자 첫 행이면 3, 나머지 2개 행은 0) */
  rowSpan: number;
  /** 부서 디폴트 "ㅇㅇ목표" 가상 행 여부 */
  isDeptVirtual: boolean;
  /** ODTY_CD=200 파트장: goalAmt = 부서목표 - 일반담당자 합계 자동계산 */
  isPartLeader: boolean;
}

const FIELD_LABEL: Record<FlatRow['field'], string> = {
  goalAmt: '목표금액',
  innerAmt: '내부생산금액',
  outerAmt: '외부생산금액 (자동)',
};

export default function GoalPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  // 목표입력 부서한정 역할 — PART_LEADER/MANAGER/STAFF 는 본인 부서만 조회·수정(서버도 강제). 그 외 role 은 전체.
  const deptScoped = user?.role === 'PART_LEADER' || user?.role === 'MANAGER' || user?.role === 'STAFF';
  const [year, setYear] = useState(dayjs().year());
  const [deptCds, setDeptCds] = useState<string[]>(
    deptScoped && user?.deptCd != null ? [String(user.deptCd)] : []
  );
  const plantCd = 2000;
  const [salesEmpId, setSalesEmpId] = useState<string>('');
  const [rows, setRows] = useState<AmGoalYearlyItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => lookupApi.getDepartments(),
  });

  const allDepts = useMemo(() =>
    (deptsData ?? [])
      .filter((d) => d.deptCd != null && d.deptNm != null && d.deptNm !== '')
      .map((d) => ({ value: String(d.deptCd), label: d.deptNm })),
    [deptsData],
  );



  const { data, isLoading } = useQuery({
    queryKey: ['am-goals-yearly', year, deptCds, plantCd, salesEmpId],
    queryFn: () => goalApi.getAmGoalsYearly(String(year), undefined, plantCd || undefined, salesEmpId || undefined, deptCds.length ? deptCds : undefined),
  });

  useEffect(() => {
    if (data) {
      setRows(data.map((r) => ({
        ...r,
        months: r.months.map((m) => ({ ...m })),
      })));
      setCurrentPage(1);
    }
  }, [data]);

  useEffect(() => {
    setCurrentPage(1);
  }, [year, deptCds, plantCd, salesEmpId]);

  /** 한 영업담당자(또는 부서가상행)의 특정 월·필드 값 변경 */
  const updateRow = (empId: string, mm: MonthCd, field: Field, value: number | null) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.salesEmpId !== empId) return r;
        return {
          ...r,
          months: r.months.map((m) => m.planMm === mm ? { ...m, [field]: value ?? 0 } : m),
        };
      }),
    );
  };

  /** 영업담당자당 3행(goal/inner/outer) FlatRow 생성. 현재 페이지 분량만. */
  const flatRows = useMemo<FlatRow[]>(() => {
    const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const result: FlatRow[] = [];
    pagedRows.forEach((emp) => {
      const isVirtual = emp.salesEmpId.startsWith('DEPT_');
      (['goalAmt', 'innerAmt', 'outerAmt'] as const).forEach((field, idx) => {
        result.push({
          key: `${emp.salesEmpId}_${field}`,
          salesEmpId: emp.salesEmpId,
          empNm: emp.empNm,
          deptCd: emp.deptCd,
          deptNm: emp.deptNm,
          field,
          rowSpan: idx === 0 ? 3 : 0,
          isDeptVirtual: isVirtual,
          isPartLeader: emp.partLeader === true,
        });
      });
    });
    return result;
  }, [rows, currentPage, pageSize]);

  /** 외부생산금액(outerAmt)과 파트장 goalAmt 자동계산 포함 */
  const getMonthValue = (empId: string, mm: MonthCd, field: FlatRow['field']): number => {
    const emp = rows.find((r) => r.salesEmpId === empId);
    if (!emp) return 0;
    const m = emp.months.find((x) => x.planMm === mm);
    if (!m) return 0;
    if (field === 'outerAmt') {
      return Math.max(0, (m.goalAmt || 0) - (m.innerAmt || 0));
    }
    // 파트장 goalAmt/innerAmt = 부서목표 - 일반 영업담당자 합계
    if ((field === 'goalAmt' || field === 'innerAmt') && emp.partLeader) {
      const deptVal = rows.find((r) => r.salesEmpId === `DEPT_${emp.deptCd}`)
        ?.months.find((x) => x.planMm === mm)?.[field] ?? 0;
      const staffSum = rows
        .filter((r) => r.deptCd === emp.deptCd && !r.salesEmpId.startsWith('DEPT_') && !r.partLeader)
        .reduce((sum, r) => sum + (r.months.find((x) => x.planMm === mm)?.[field] ?? 0), 0);
      return Math.max(0, deptVal - staffSum);
    }
    return (m[field] as number) || 0;
  };

  const getRowTotal = (empId: string, field: FlatRow['field']): number => {
    return MONTHS.reduce((sum, mm) => sum + getMonthValue(empId, mm, field), 0);
  };

  const handleDownloadExcel = () => {
    const headers = ['부서명', '영업담당자', '항목', ...MONTHS.map((mm) => `${parseInt(mm, 10)}월`), '합계'];
    const aoa: (string | number)[][] = [headers];
    const merges: XLSX.Range[] = [];
    let rowIdx = 1;

    rows.forEach((emp) => {
      (['goalAmt', 'innerAmt', 'outerAmt'] as const).forEach((field, fi) => {
        const monthValues = MONTHS.map((mm) => getMonthValue(emp.salesEmpId, mm as MonthCd, field));
        const total = monthValues.reduce((sum, v) => sum + v, 0);
        aoa.push([
          fi === 0 ? (emp.deptNm || '') : '',
          fi === 0 ? emp.empNm : '',
          FIELD_LABEL[field],
          ...monthValues,
          total,
        ]);
      });
      merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx + 2, c: 0 } });
      merges.push({ s: { r: rowIdx, c: 1 }, e: { r: rowIdx + 2, c: 1 } });
      rowIdx += 3;
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols'] = [
      { wch: 16 }, { wch: 14 }, { wch: 20 },
      ...MONTHS.map(() => ({ wch: 12 })),
      { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '목표입력');
    XLSX.writeFile(wb, `목표입력_${year}년.xlsx`);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        ...r,
        months: r.months.map((m) => ({
          planMm: m.planMm,
          // 파트장 goalAmt는 계산값으로 전송 (부서목표 - 일반담당자 합계)
          goalAmt: r.partLeader
            ? getMonthValue(r.salesEmpId, m.planMm as MonthCd, 'goalAmt')
            : (m.goalAmt || 0),
          innerAmt: r.partLeader
            ? getMonthValue(r.salesEmpId, m.planMm as MonthCd, 'innerAmt')
            : (m.innerAmt || 0),
          outerAmt: 0,
        })),
      }));
      await goalApi.saveAmGoalsYearly({ planYy: String(year), plantCd, goals: payload });
      // 저장 전 조회 결과가 전역 staleTime(5분) 동안 캐시에 남아 있으면
      // 화면 재진입 시 저장 전 값으로 되돌아가 보일 수 있다. 저장 결과를 즉시 재조회한다.
      await queryClient.invalidateQueries({
        queryKey: ['am-goals-yearly'],
        refetchType: 'active',
      });
      message.success('저장되었습니다.');
    } catch {
      message.error('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const monthColumns: ColumnsType<FlatRow> = MONTHS.map((mm) => ({
    title: `${parseInt(mm, 10)}월`,
    key: `m_${mm}`,
    width: 110,
    align: 'right' as const,
    render: (_: unknown, record) => {
      const val = getMonthValue(record.salesEmpId, mm, record.field);
      // 자동 계산 필드: outerAmt, 또는 파트장의 goalAmt/innerAmt
      const isAutoCalc = record.field === 'outerAmt' || (record.isPartLeader && (record.field === 'goalAmt' || record.field === 'innerAmt'));
      if (isAutoCalc) {
        return (
          <Text style={{ fontSize: 12, color: '#64748b' }} className="tabular-nums">
            {fmtNum(val)}
          </Text>
        );
      }
      return (
        <InputNumber
          size="small"
          value={val}
          onChange={(v) => updateRow(record.salesEmpId, mm, record.field as Field, v)}
          formatter={fmtNum}
          parser={parseNum}
          style={{ width: '100%' }}
          min={0}
          controls={false}
        />
      );
    },
  }));

  const columns: ColumnsType<FlatRow> = [
    {
      title: '부서명',
      key: 'deptNm',
      width: 110,
      fixed: 'left' as const,
      onCell: (record) => ({ rowSpan: record.rowSpan }),
      render: (_, record) => (
        <Text style={{ fontSize: 13 }}>{record.deptNm || '-'}</Text>
      ),
    },
    {
      title: '영업담당자',
      key: 'empNm',
      width: 130,
      fixed: 'left' as const,
      onCell: (record) => ({ rowSpan: record.rowSpan }),
      render: (_, record) => (
        <Text strong={record.isDeptVirtual} style={{
          fontSize: 13,
          color: record.isDeptVirtual ? '#1e40af' : undefined,
        }}>
          {record.empNm}
        </Text>
      ),
    },
    {
      title: '항목',
      key: 'field',
      width: 130,
      fixed: 'left' as const,
      render: (_, record) => (
        <Text style={{
          fontSize: 12,
          color: record.field === 'outerAmt' ? '#64748b' : '#1e293b',
        }}>
          {FIELD_LABEL[record.field]}
        </Text>
      ),
    },
    ...monthColumns,
    {
      title: '합계',
      key: 'total',
      width: 130,
      align: 'right' as const,
      fixed: 'right' as const,
      render: (_, record) => (
        <Text strong style={{ color: '#1e40af', fontSize: 13 }} className="tabular-nums">
          {fmtNum(getRowTotal(record.salesEmpId, record.field))}
        </Text>
      ),
    },
  ];

  return (
    <PageLayout>
      <PageHeader title="목표 입력" />

      <Card
        variant="borderless"
        styles={{ body: { padding: '12px 16px' } }}
        style={{ marginBottom: 16, borderRadius: 12, border: '1px solid #f1f5f9' }}
      >
        <Row gutter={12} align="middle">
          {/* <Col>
            <Select
              value={plantCd ?? 0}
              onChange={(v) => setPlantCd(v === 0 ? undefined : v)}
              options={plantOptions}
              style={{ width: 140 }}
              placeholder="공장 선택"
            />
          </Col> */}
          <Col>
            <Select
              mode="multiple"
              allowClear={!deptScoped}
              showSearch
              placeholder="영업부서 (N개 선택 가능)"
              value={deptCds}
              options={allDepts}
              onChange={(v) => { setDeptCds(v); setSalesEmpId(''); }}
              style={{ width: 240 }}
              maxTagCount="responsive"
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
              popupMatchSelectWidth={false}
              // 부서한정 역할은 본인 부서 고정(변경 불가). 서버도 강제하지만 UX 일치.
              disabled={deptScoped}
            />
          </Col>

          <Col>
            <Select
              value={year}
              onChange={setYear}
              options={[2024, 2025, 2026, 2027].map((y) => ({ label: `${y}년`, value: y }))}
              style={{ width: 100 }}
            />
          </Col>
          <Col style={{ marginLeft: 'auto' }}>
            <Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                * 외부생산금액(자동) = 목표금액 − 내부생산금액
              </Text>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleDownloadExcel}
                disabled={rows.length === 0}
              >
                엑셀다운로드
              </Button>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={handleSave}
              >
                저장
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Table<FlatRow>
        columns={columns}
        dataSource={flatRows}
        loading={isLoading}
        rowKey="key"
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 1800 }}
        style={{ fontSize: 13 }}
        rowClassName={(record) =>
          record.isDeptVirtual ? 'goal-dept-row' : ''
        }
      />

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Pagination
          current={currentPage}
          total={rows.length}
          pageSize={pageSize}
          showSizeChanger
          showTotal={(total) => `Total ${total} items`}
          pageSizeOptions={['10', '20', '50']}
          onChange={(newPage, newSize) => {
            setCurrentPage(newPage);
            if (newSize !== pageSize) { setPageSize(newSize); setCurrentPage(1); }
          }}
        />
      </div>

      <style>{`
        .goal-dept-row td {
          background: #f0f4ff !important;
        }
      `}</style>
    </PageLayout>
  );
}
