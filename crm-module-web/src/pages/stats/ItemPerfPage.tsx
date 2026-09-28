import React, { useEffect, useMemo, useState } from 'react';
import { Card, message, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { getItemPerformance } from '@/api/stats.api';
import { lookupApi } from '@/api/info.api';
import { codeApi } from '@/api/code.api';
import type { CategoryPerformance, ItemPerformanceDto } from '@/types/stats';
import { PageLayout, PageHeader } from '@/components/layout';
import { ExcelDownloadBtn } from '@/components/table';
import StatsDateRangePicker from './components/StatsDateRangePicker';

const { Text } = Typography;

const T = {
  title: '\uD488\uBAA9\uBCC4 \uC2E4\uC801',
  subtitle: '\uC6D4 \uAE30\uC900 \uD488\uBAA9\uBCC4 \uB9E4\uCD9C \uBE44\uC911\uACFC \uC9D1\uACC4 \uD14C\uC774\uBE14',
  itemType: '\uD488\uBAA9\uBA85',
  itemAll: '\uC804\uCCB4',
  period: '\uC870\uD68C \uAE30\uAC04',
  search: '\uD488\uBAA9\uBA85 \uAC80\uC0C9',
  team: '\uD300',
  teamAll: '\uD300 \uC804\uCCB4',
  part: '\uD30C\uD2B8',
  partAll: '\uD30C\uD2B8 \uC804\uCCB4',
  chartTitle: '\uD488\uBAA9\uBCC4 \uBE44\uC911',
  code: '\uD488\uBAA9\uCF54\uB4DC',
  name: '\uD488\uBAA9',
  count: '\uD310\uB9E4\uAC74\uC218',
  sales: '\uB9E4\uCD9C\uC561',
  purchase: '\uB9E4\uC785\uC561',
  margin: '\uCC28\uC561',
  rate: '\uCC28\uC561\uB960',
  vendor: '\uC8FC\uC694\uAC70\uB798\uCC98',
  total: '\uD569\uACC4',
  noVendor: '\uC9D1\uACC4\uAE30\uC900',
  loadFail: '\uB370\uC774\uD130 \uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
  won: '\uC6D0',
  dateSuffix: '\uD604\uC7AC',
};

const COLORS = ['#2563eb', '#22c55e', '#f97316', '#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#64748b', '#84cc16', '#06b6d4'];
const POSITIVE_COLOR = '#cf1322';
const NEGATIVE_COLOR = '#1677ff';

const formatAmount = (value?: number) => (value ?? 0).toLocaleString();
const formatWon = (value?: number) => `${formatAmount(value)}${T.won}`;
const isExecutiveDept = (name?: string) => (name ?? '').trim() === '임원';

const ItemPerfPage: React.FC = () => {
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs(),
  ]);
  const [categoryType, setCategoryType] = useState<string>();
  const [itemKeyword] = useState<string>(); // 품목명 검색 제거 — 쿼리 파라미터로만 유지(항상 미지정)
  const [teamCd, setTeamCd] = useState<string>();
  const [partCd, setPartCd] = useState<string>();
  const [data, setData] = useState<ItemPerformanceDto | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: erpItemCategories = [] } = useQuery({
    queryKey: ['itemCategories'],
    queryFn: lookupApi.getItemCategories,
    staleTime: 10 * 60 * 1000,
  });
  const { data: smItemCategories = [] } = useQuery({
    queryKey: ['common-codes', 'ITEM_TYPE'],
    queryFn: () => codeApi.getCodes('ITEM_TYPE'),
    staleTime: 10 * 60 * 1000,
  });
  const itemCategories = useMemo(() => {
    const merged = new Map<string, string>();
    erpItemCategories.forEach((item) => merged.set(item.value, item.label));
    smItemCategories.forEach((item) => merged.set(item.code, item.label));
    return Array.from(merged, ([value, label]) => ({ value, label }));
  }, [erpItemCategories, smItemCategories]);

  // 부서 트리 (팀=상위부서, 파트=하위부서)
  const { data: deptTree = [] } = useQuery({
    queryKey: ['deptTree'],
    queryFn: lookupApi.getDeptTree,
    staleTime: 10 * 60 * 1000,
  });
  // 팀 = 다른 부서(파트)가 up_dept_cd 로 참조하는 상위부서.
  const teamOptions = useMemo(() => {
    const parentCds = new Set(
      deptTree.map((d) => d.upDeptCd).filter((v): v is number => v != null),
    );
    return deptTree
      .filter((d) => parentCds.has(d.deptCd) && !isExecutiveDept(d.deptNm))
      .map((d) => ({ label: d.deptNm, value: String(d.deptCd) }));
  }, [deptTree]);
  // 파트 = 선택한 팀을 up_dept_cd 로 가진 하위부서.
  const partOptions = useMemo(() => {
    if (!teamCd) return [];
    return deptTree
      .filter((d) => d.upDeptCd != null && String(d.upDeptCd) === teamCd)
      .map((d) => ({ label: d.deptNm, value: String(d.deptCd) }));
  }, [deptTree, teamCd]);

  useEffect(() => {
    if (teamCd && !teamOptions.some((option) => option.value === teamCd)) {
      setTeamCd(undefined);
      setPartCd(undefined);
    }
  }, [teamCd, teamOptions]);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const { data: res } = await getItemPerformance(
          dateRange[0].format('YYYY-MM-DD'),
          dateRange[1].format('YYYY-MM-DD'),
          categoryType,
          itemKeyword,
          teamCd,
          partCd,
        );
        if (res.success) setData(res.data);
      } catch {
        message.error(T.loadFail);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [dateRange, categoryType, itemKeyword, teamCd, partCd]);

  const itemCategoryLabelMap = useMemo(
    () => new Map(itemCategories.map((item) => [item.value, item.label])),
    [itemCategories],
  );

  const rows = useMemo(() => (data?.categories ?? []).map((item) => ({
    ...item,
    categoryLabel: itemCategoryLabelMap.get(item.categoryCode) || item.categoryLabel || item.categoryCode,
  })), [data?.categories, itemCategoryLabelMap]);

  const salesTotal = rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0);
  const purchaseTotal = rows.reduce((sum, row) => sum + (row.costAmount ?? 0), 0);
  const marginTotal = salesTotal - purchaseTotal;
  const marginRate = salesTotal > 0 ? Math.round((marginTotal * 1000) / salesTotal) / 10 : 0;

  const pieTotal = rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0);

  const pieData = rows
    .map((row) => {
      const value = row.totalAmount ?? 0;
      return {
        name: row.categoryLabel || row.categoryCode || '-',
        value,
        salesAmount: row.totalAmount ?? 0,
        purchaseAmount: row.costAmount ?? 0,
        rate: pieTotal > 0 ? Math.round((value * 1000) / pieTotal) / 10 : 0,
      };
    })
    .filter((row) => row.value > 0);

  const columns: ColumnsType<CategoryPerformance> = [
    { title: T.code, dataIndex: 'categoryCode', width: 120 },
    {
      title: T.name,
      dataIndex: 'categoryLabel',
      width: 160,
      render: (value) => <Text strong>{value || '-'}</Text>,
    },
    { title: T.count, dataIndex: 'orderCount', width: 100, align: 'right', render: formatAmount },
    { title: T.sales, dataIndex: 'totalAmount', width: 130, align: 'right', className: 'item-perf-sales-cell', render: formatAmount },
    { title: T.purchase, dataIndex: 'costAmount', width: 130, align: 'right', render: formatAmount },
    {
      title: T.margin,
      dataIndex: 'marginAmount',
      width: 120,
      align: 'right',
      render: (value: number) => (
        <Text strong style={{ color: value >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatAmount(value)}</Text>
      ),
    },
    {
      title: T.rate,
      dataIndex: 'marginRate',
      width: 100,
      align: 'center',
      render: (value: number) => (
        <Tag color={(value ?? 0) >= 0 ? 'red' : 'blue'}>{(value ?? 0).toFixed(1)}%</Tag>
      ),
    },
    { title: T.vendor, dataIndex: 'topVendor', width: 140, render: (value) => value || T.noVendor },
  ];

  const excelColumns = [
    { header: T.code, key: 'categoryCode' },
    { header: T.name, key: 'categoryLabel' },
    { header: T.count, key: 'orderCount' },
    { header: T.sales, key: 'totalAmount' },
    { header: T.purchase, key: 'costAmount' },
    { header: T.margin, key: 'marginAmount' },
    { header: T.rate, key: 'marginRate' },
  ];

  return (
    <PageLayout>
      <PageHeader title={T.title} titleStyle={{ fontSize: 30, fontWeight: 900, color: '#001f3f', lineHeight: 1.15 }} />
      <Text type="secondary" style={{ display: 'block', marginTop: -12, marginBottom: 12 }}>
        {T.subtitle}
      </Text>

      <Card style={{ marginBottom: 12 }}>
        <Space wrap size={12}>
          <Select
            placeholder={T.itemType}
            allowClear
            style={{ width: 160 }}
            value={categoryType}
            onChange={setCategoryType}
            options={[{ label: T.itemAll, value: '' }, ...itemCategories]}
            showSearch
            optionFilterProp="label"
          />
          <Space size={6}>
            <Text strong style={{ fontSize: 12 }}>{T.period}</Text>
            <StatsDateRangePicker value={dateRange} onChange={setDateRange} />
          </Space>
          {/* 품목명 검색 입력 제거 — 좌측 품목명(품목구분) 셀렉트와 중복이라 삭제. */}
          <Select
            placeholder={T.team}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 150 }}
            value={teamCd}
            onChange={(v) => { setTeamCd(v); setPartCd(undefined); }}
            options={[{ label: T.teamAll, value: '' }, ...teamOptions]}
          />
          <Select
            placeholder={T.part}
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 150 }}
            value={partCd}
            onChange={setPartCd}
            disabled={!teamCd}
            options={[{ label: T.partAll, value: '' }, ...partOptions]}
          />
          <div style={{
            minWidth: 260,
            padding: '8px 12px',
            borderRadius: 6,
            background: '#e8f4ff',
            color: '#003a5d',
            fontSize: 12,
            fontWeight: 700,
          }}>
            {dateRange[0].format('YYYY-MM-DD')} ~ {dateRange[1].format('YYYY-MM-DD')} {'\u00B7'} {T.total} {formatWon(salesTotal)}
          </div>
          <ExcelDownloadBtn
            data={rows as unknown as Record<string, unknown>[]}
            columns={excelColumns}
            fileName={`item_performance_${dateRange[0].format('YYYYMMDD')}_${dateRange[1].format('YYYYMMDD')}`}
          />
        </Space>
      </Card>

      <Card
        title={T.chartTitle}
        extra={<Text type="secondary">{dateRange[0].format('YYYY-MM-DD')} ~ {dateRange[1].format('YYYY-MM-DD')} {'\u00B7'} {T.dateSuffix}</Text>}
        style={{ marginBottom: 12 }}
        className="item-perf-chart-card"
      >
        <div className="item-perf-chart-wrap">
          <div className="item-perf-donut-box">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={96}
                  paddingAngle={1}
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, item: any) => [
                    `${formatWon(value)} / ${T.sales} ${formatWon(item?.payload?.salesAmount)} / ${T.purchase} ${formatWon(item?.payload?.purchaseAmount)}`,
                    item?.payload?.name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="item-perf-donut-center">
              <span>{T.total}</span>
              <strong>{formatAmount(pieTotal)}</strong>
            </div>
          </div>
          <div className="item-perf-legend-grid">
            {pieData.map((item, index) => (
              <div key={`${item.name}-${index}`} className="item-perf-legend-item">
                <span style={{ background: COLORS[index % COLORS.length] }} />
                <b>{item.name}</b>
                <em>{item.rate.toFixed(1)}%</em>
              </div>
            ))}
          </div>
        </div>
      </Card>
      <Table
        columns={columns}
        dataSource={rows}
        rowKey={(row) => row.categoryCode || row.category}
        loading={loading}
        pagination={false}
        bordered
        size="middle"
        className="item-perf-table"
        scroll={{ x: 1060 }}
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={2}><Text strong>{T.total}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={2} align="right">
              <Text strong>{formatAmount(rows.reduce((sum, row) => sum + (row.orderCount ?? 0), 0))}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right"><Text strong>{formatAmount(salesTotal)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right"><Text strong>{formatAmount(purchaseTotal)}</Text></Table.Summary.Cell>
            <Table.Summary.Cell index={5} align="right">
              <Text strong style={{ color: marginTotal >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{formatAmount(marginTotal)}</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={6} align="center">
              <Text strong style={{ color: marginRate >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR }}>{marginRate.toFixed(1)}%</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={7} />
          </Table.Summary.Row>
        )}
      />

      <style>{`
        .item-perf-chart-card .ant-card-head {
          min-height: 42px;
          padding: 0 14px;
          border-bottom-color: #dbe7f0;
        }

        .item-perf-chart-card .ant-card-head-title {
          padding: 10px 0;
          font-size: 14px;
          font-weight: 900;
          color: #0b2742;
        }

        .item-perf-chart-card .ant-card-body {
          padding: 18px 28px 20px;
        }

        .item-perf-chart-wrap {
          min-height: 250px;
          display: grid;
          grid-template-columns: minmax(260px, 34%) 1fr;
          align-items: center;
          column-gap: 28px;
        }

        .item-perf-donut-box {
          position: relative;
          width: 100%;
          max-width: 340px;
          justify-self: center;
        }

        .item-perf-donut-center {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          color: #0b2742;
          line-height: 1.1;
        }

        .item-perf-donut-center span {
          font-size: 12px;
          font-weight: 900;
        }

        .item-perf-donut-center strong {
          margin-top: 7px;
          font-size: 16px;
          color: #00879a;
        }

        .item-perf-legend-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(180px, 1fr));
          gap: 10px 32px;
          align-content: center;
          max-width: 760px;
        }

        .item-perf-legend-item {
          display: grid;
          grid-template-columns: 10px minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
          min-width: 0;
          color: #0b2742;
          font-size: 12px;
          font-weight: 800;
        }

        .item-perf-legend-item span {
          width: 9px;
          height: 9px;
          border-radius: 2px;
        }

        .item-perf-legend-item b {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .item-perf-legend-item em {
          color: #00879a;
          font-style: normal;
          font-weight: 900;
        }

        .item-perf-table .ant-table {
          font-size: 12px;
          color: #0b2742;
        }

        .item-perf-table .ant-table-thead > tr > th {
          background: #e8f3f8;
          color: #0b2742;
          font-size: 12px;
          font-weight: 900;
          text-align: center;
          padding: 7px 10px;
          border-color: #d7e5ed;
        }

        .item-perf-table .ant-table-tbody > tr > td,
        .item-perf-table .ant-table-summary > tr > td {
          padding: 8px 10px;
          border-color: #e5edf2;
          font-weight: 700;
        }

        .item-perf-table .ant-table-summary > tr > td {
          background: #f7fbfd;
          font-weight: 900;
        }

        .item-perf-table .item-perf-sales-cell {
          background: #fff8d8;
        }

        .item-perf-table .ant-tag {
          min-width: 56px;
          text-align: center;
          margin-inline-end: 0;
          border-radius: 999px;
          font-weight: 900;
        }

        @media (max-width: 900px) {
          .item-perf-chart-wrap {
            grid-template-columns: 1fr;
            row-gap: 8px;
          }

          .item-perf-legend-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </PageLayout>
  );
};

export default ItemPerfPage;
