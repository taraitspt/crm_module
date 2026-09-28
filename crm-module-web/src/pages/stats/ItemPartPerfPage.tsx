import React, { useEffect, useMemo, useState } from 'react';
import { Card, message, Select, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getItemPartPerformance } from '@/api/stats.api';
import { lookupApi } from '@/api/info.api';
import type { ItemPartPerformanceDto, ItemPartPerformanceRow } from '@/types/stats';
import { PageHeader, PageLayout } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import StatsDateRangePicker from './components/StatsDateRangePicker';

const { Text } = Typography;
const formatAmount = (value?: number) => (value ?? 0).toLocaleString();
const isExecutiveDept = (name?: string) => (name ?? '').trim() === '임원';
type PartTableRow = ItemPartPerformanceRow & { _rowKey?: string; _teamTotal?: boolean };

const ItemPartPerfPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);
  const [teamCd, setTeamCd] = useState<string>();
  const [partCd, setPartCd] = useState<string>();
  const [data, setData] = useState<ItemPartPerformanceDto>();
  const [loading, setLoading] = useState(false);
  const { data: deptTree = [] } = useQuery({
    queryKey: ['deptTree'],
    queryFn: lookupApi.getDeptTree,
    staleTime: 10 * 60 * 1000,
  });
  const deptNameMap = useMemo(
    () => new Map(deptTree.map((dept) => [String(dept.deptCd), dept.deptNm])),
    [deptTree],
  );
  const teamOptions = useMemo(() => {
    const parentCds = new Set(deptTree.map((d) => d.upDeptCd).filter((v): v is number => v != null));
    return deptTree
      .filter((d) => parentCds.has(d.deptCd) && !isExecutiveDept(d.deptNm))
      .map((d) => ({ label: d.deptNm, value: String(d.deptCd) }));
  }, [deptTree]);
  const partOptions = useMemo(() => (
    teamCd
      ? deptTree
          .filter((d) => d.upDeptCd != null && String(d.upDeptCd) === teamCd)
          .map((d) => ({ label: d.deptNm, value: String(d.deptCd) }))
      : []
  ), [deptTree, teamCd]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await getItemPartPerformance(
          dateRange[0].format('YYYY-MM-DD'),
          dateRange[1].format('YYYY-MM-DD'),
          teamCd,
          partCd,
        );
        if (response.data.success) setData(response.data.data);
      } catch {
        message.error('데이터 조회에 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange, teamCd, partCd]);

  const rows = useMemo(() => (data?.rows ?? []).map((row) => ({
    ...row,
    departmentName: deptNameMap.get(String(row.departmentCd)) || row.departmentCd || '부서 미지정',
  })), [data?.rows, deptNameMap]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    design: sum.design + (row.designAmount ?? 0),
    manual: sum.manual + (row.manualWorkAmount ?? 0),
    delivery: sum.delivery + (row.deliveryAmount ?? 0),
    total: sum.total + (row.totalAmount ?? 0),
  }), { design: 0, manual: 0, delivery: 0, total: 0 }), [rows]);

  const tableRows = useMemo<PartTableRow[]>(() => {
    const teamOrder = ['BS1팀', 'BS2팀', 'BS3팀'];
    // 통합실적과 동일한 조직 표시 순서. 목록에 없는 신규 파트는 팀 내 마지막에 이름순으로 둔다.
    const partOrder = [
      'BS1팀 역삼1파트', 'BS1팀 역삼2파트', 'BS1팀 강남파트', 'BS1팀 대치파트',
      'BS2팀 시청파트', 'BS2팀 을지로파트', 'BS2팀 서소문1파트', 'BS2팀 서소문2파트',
      'BS2팀 구로파트', 'BS2팀 여의도파트', 'BS2팀 보라매파트',
      'BS3팀 전략사업파트',
    ];
    const partOrderIndex = new Map(partOrder.map((name, index) => [name.replace(/\s+/g, ''), index]));
    const compareParts = (a: ItemPartPerformanceRow, b: ItemPartPerformanceRow) => {
      const aName = (a.departmentName ?? '').replace(/\s+/g, '');
      const bName = (b.departmentName ?? '').replace(/\s+/g, '');
      const aOrder = partOrderIndex.get(aName) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = partOrderIndex.get(bName) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || aName.localeCompare(bName, 'ko');
    };
    const groups = new Map<string, ItemPartPerformanceRow[]>(teamOrder.map((team) => [team, []]));
    const others: ItemPartPerformanceRow[] = [];
    rows.forEach((row) => {
      const team = teamOrder.find((name) => (row.departmentName ?? '').startsWith(name));
      if (team) groups.get(team)?.push(row);
      else others.push(row);
    });

    const output: PartTableRow[] = [];
    teamOrder.forEach((team) => {
      const members = groups.get(team) ?? [];
      if (!members.length) return;
      members.sort(compareParts);
      output.push(...members.map((row) => ({ ...row, _rowKey: `dept-${row.departmentCd}` })));
      const sum = (field: keyof ItemPartPerformanceRow) => members.reduce((total, row) => total + Number(row[field] ?? 0), 0);
      output.push({
        departmentCd: `TOTAL-${team}`,
        departmentName: `${team}합계`,
        totalSalesCount: sum('totalSalesCount'),
        noExtraCostCount: sum('noExtraCostCount'),
        designCount: sum('designCount'),
        designAmount: sum('designAmount'),
        manualWorkCount: sum('manualWorkCount'),
        manualWorkAmount: sum('manualWorkAmount'),
        deliveryCount: sum('deliveryCount'),
        deliveryAmount: sum('deliveryAmount'),
        totalAmount: sum('totalAmount'),
        orderCount: sum('orderCount'),
        _rowKey: `total-${team}`,
        _teamTotal: true,
      });
    });
    others.sort((a, b) => (a.departmentName ?? '').localeCompare(b.departmentName ?? '', 'ko'));
    output.push(...others.map((row) => ({ ...row, _rowKey: `dept-${row.departmentCd}` })));
    return output;
  }, [rows]);

  // #447(2026-09-15, 백미연) — 엑셀을 화면과 같은 형태·순서로. 종전엔 서버 응답 순서(rows)를 그대로 써서
  //   팀·파트 정렬과 팀합계 행이 빠지고 맨 아래 총합계도 없었다. 화면 표(tableRows) + 총합계 행을 그대로 내보낸다.
  const excelRows = useMemo<PartTableRow[]>(() => {
    if (!tableRows.length) return [];
    const sum = (field: keyof ItemPartPerformanceRow) =>
      rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
    return [
      ...tableRows,
      {
        departmentCd: 'TOTAL',
        departmentName: '합계',
        totalSalesCount: sum('totalSalesCount'),
        noExtraCostCount: sum('noExtraCostCount'),
        designCount: sum('designCount'),
        designAmount: totals.design,
        manualWorkCount: sum('manualWorkCount'),
        manualWorkAmount: totals.manual,
        deliveryCount: sum('deliveryCount'),
        deliveryAmount: totals.delivery,
        totalAmount: totals.total,
        orderCount: sum('orderCount'),
        _rowKey: 'total-all',
      },
    ];
  }, [tableRows, rows, totals]);

  const columns: ColumnsType<PartTableRow> = [
    { title: '영업부서', dataIndex: 'departmentName', width: 200, render: (v) => <Text strong>{v}</Text> },
    { title: '총 매출건수', dataIndex: 'totalSalesCount', width: 120, align: 'right', render: formatAmount },
    { title: '부대비용 없음', dataIndex: 'noExtraCostCount', width: 130, align: 'right', render: formatAmount },
    { title: '디자인 건수', dataIndex: 'designCount', width: 110, align: 'right', render: formatAmount },
    {
      title: '디자인 금액',
      dataIndex: 'designAmount',
      width: 150,
      align: 'right',
      render: (v) => `${formatAmount(v)}원`,
    },
    { title: '수작업비 건수', dataIndex: 'manualWorkCount', width: 120, align: 'right', render: formatAmount },
    {
      title: '수작업비 금액',
      dataIndex: 'manualWorkAmount',
      width: 150,
      align: 'right',
      render: (v) => `${formatAmount(v)}원`,
    },
    { title: '배송비 건수', dataIndex: 'deliveryCount', width: 110, align: 'right', render: formatAmount },
    {
      title: '배송비 금액',
      dataIndex: 'deliveryAmount',
      width: 150,
      align: 'right',
      render: (v) => `${formatAmount(v)}원`,
    },
    {
      title: '합계',
      dataIndex: 'totalAmount',
      width: 160,
      align: 'right',
      render: (v) => <Text strong>{formatAmount(v)}원</Text>,
    },
  ];

  return (
    <PageLayout>
      <PageHeader
        title="파트별 부대비용 실적"
        titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f', lineHeight: 1.15 }}
      />
      <Text type="secondary" style={{ display: 'block', marginTop: -12, marginBottom: 12 }}>
        매출 영업부서별 디자인·수작업비·배송비 실적을 조회합니다.
      </Text>

      <Card style={{ marginBottom: 12 }}>
        <Space wrap size={12}>
          <StatsDateRangePicker value={dateRange} onChange={setDateRange} />
          <Select
            placeholder="팀"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 160 }}
            value={teamCd}
            onChange={(value) => { setTeamCd(value); setPartCd(undefined); }}
            options={[{ label: '팀 전체', value: '' }, ...teamOptions]}
          />
          <Select
            placeholder="파트"
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 160 }}
            value={partCd}
            onChange={setPartCd}
            disabled={!teamCd}
            options={[{ label: '파트 전체', value: '' }, ...partOptions]}
          />
          <div style={{ padding: '8px 12px', borderRadius: 6, background: '#e8f4ff', fontWeight: 800 }}>
            합계 {formatAmount(totals.total)}원
          </div>
          <ExcelDownloadBtn
            data={excelRows as unknown as Record<string, unknown>[]}
            columns={[
              { header: '영업부서', key: 'departmentName' },
              { header: '총 매출건수', key: 'totalSalesCount' },
              { header: '부대비용 없음', key: 'noExtraCostCount' },
              { header: '디자인 건수', key: 'designCount' },
              { header: '디자인 금액', key: 'designAmount' },
              { header: '수작업비 건수', key: 'manualWorkCount' },
              { header: '수작업비 금액', key: 'manualWorkAmount' },
              { header: '배송비 건수', key: 'deliveryCount' },
              { header: '배송비 금액', key: 'deliveryAmount' },
              { header: '합계', key: 'totalAmount' },
            ]}
            fileName={`department_part_performance_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`}
          />
        </Space>
      </Card>

      <Card title="영업부서별 실적" style={{ marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="departmentName" />
            <YAxis width={82} tickMargin={4} tickFormatter={(value) => Number(value).toLocaleString()} />
            <Tooltip formatter={(value: number) => `${formatAmount(value)}원`} />
            <Legend />
            <Bar dataKey="designAmount" name="디자인" stackId="amount" fill="#2563eb" />
            <Bar dataKey="manualWorkAmount" name="수작업비" stackId="amount" fill="#f97316" />
            <Bar dataKey="deliveryAmount" name="배송비" stackId="amount" fill="#22c55e" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Table
        columns={columns}
        dataSource={tableRows}
        rowKey={(row) => row._rowKey ?? String(row.departmentCd)}
        rowClassName={(row) => row._teamTotal ? 'item-part-team-total-row' : ''}
        loading={loading}
        pagination={false}
        bordered
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0}><Text strong>합계</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={1} align="right">
              <Text strong>{formatAmount(rows.reduce((sum, row) => sum + (row.totalSalesCount ?? 0), 0))}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">
              <Text strong>{formatAmount(rows.reduce((sum, row) => sum + (row.noExtraCostCount ?? 0), 0))}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">
              <Text strong>{formatAmount(rows.reduce((sum, row) => sum + (row.designCount ?? 0), 0))}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right">
              <Text strong>{formatAmount(totals.design)}원</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right">
              <Text strong>{formatAmount(rows.reduce((sum, row) => sum + (row.manualWorkCount ?? 0), 0))}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="right">
              <Text strong>{formatAmount(totals.manual)}원</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7} align="right">
              <Text strong>{formatAmount(rows.reduce((sum, row) => sum + (row.deliveryCount ?? 0), 0))}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={8} align="right"><Text strong>{formatAmount(totals.delivery)}원</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={9} align="right"><Text strong>{formatAmount(totals.total)}원</Text></Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
      <style>{`
        .item-part-team-total-row > td {
          background: #f0f7fa !important;
          color: #003a5d;
          font-weight: 900;
          border-top: 2px solid #b9d6e2 !important;
        }
      `}</style>
    </PageLayout>
  );
};

export default ItemPartPerfPage;
