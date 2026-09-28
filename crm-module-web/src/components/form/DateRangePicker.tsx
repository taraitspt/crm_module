import React, { useMemo, useState } from 'react';
import { DatePicker, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;

type Preset = { label: string; value: [Dayjs, Dayjs]; month?: number };

const buildPresets = (): Preset[] => {
  const today = dayjs();
  const year = today.year();
  const month = (index: number) => dayjs().year(year).month(index);
  return [
    { label: '오늘', value: [today.startOf('day'), today.endOf('day')] },
    { label: '오늘까지', value: [today.startOf('year'), today.endOf('day')] },
    { label: '어제', value: [today.subtract(1, 'day').startOf('day'), today.subtract(1, 'day').endOf('day')] },
    { label: '이번 주', value: [today.startOf('week'), today.endOf('week')] },
    { label: '전주', value: [today.subtract(1, 'week').startOf('week'), today.subtract(1, 'week').endOf('week')] },
    { label: '당월', value: [today.startOf('month'), today.endOf('month')] },
    { label: '전월', value: [today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month')] },
    { label: '올해', value: [today.startOf('year'), today.endOf('year')] },
    { label: '전년도', value: [today.subtract(1, 'year').startOf('year'), today.subtract(1, 'year').endOf('year')] },
    { label: '전전년도', value: [today.subtract(2, 'year').startOf('year'), today.subtract(2, 'year').endOf('year')] },
    { label: '1분기', value: [month(0).startOf('month'), month(2).endOf('month')] },
    { label: '2분기', value: [month(3).startOf('month'), month(5).endOf('month')] },
    { label: '3분기', value: [month(6).startOf('month'), month(8).endOf('month')] },
    { label: '4분기', value: [month(9).startOf('month'), month(11).endOf('month')] },
    { label: '상반기', value: [month(0).startOf('month'), month(5).endOf('month')] },
    { label: '하반기', value: [month(6).startOf('month'), month(11).endOf('month')] },
    ...Array.from({ length: 12 }, (_, index) => ({
      label: `${index + 1}월`,
      value: [month(index).startOf('month'), month(index).endOf('month')] as [Dayjs, Dayjs],
      month: index,
    })),
  ];
};

interface DateRangePickerProps {
  /** 라벨 텍스트 */
  label?: string;
  /** 선택된 범위 [시작일, 종료일] */
  value?: [string | null, string | null];
  /** 범위 변경 콜백 */
  onChange: (dates: [string | null, string | null]) => void;
  /** 날짜 형식 */
  format?: string;
  width?: number | string;
  /** 비어 있을 때 칸 안에 흐리게 보이는 안내글 [시작, 종료]. 라벨 없이 조회 기준만 슬쩍 알려주고 싶을 때. */
  placeholder?: [string, string];
}

/**
 * 기간 선택 컴포넌트.
 * Ant Design RangePicker를 래핑하여 문자열(YYYY-MM-DD) 입출력을 지원한다.
 */
const DateRangePicker: React.FC<DateRangePickerProps> = ({
  label = '기간',
  value,
  onChange,
  format = 'YYYY-MM-DD',
  width = 260,
  placeholder,
}) => {
  const presets = useMemo(buildPresets, []);
  const presetRows = useMemo(() => [
    presets.slice(0, 8),
    presets.slice(8, 16),
    presets.slice(16),
  ], [presets]);

  // 월 버튼 범위 선택: 첫 월 클릭 = 시작(앵커), 두 번째 월 클릭 = 두 월을 아우르는 범위(min월1일~max월말일).
  const [anchorMonth, setAnchorMonth] = useState<number | null>(null);
  const handlePresetClick = (preset: Preset) => {
    if (preset.month != null) {
      if (anchorMonth == null) {
        // 첫 월 클릭 — 우선 그 달만 선택하고, 다음 월 클릭을 기다린다(앵커).
        setAnchorMonth(preset.month);
        onChange([preset.value[0].format(format), preset.value[1].format(format)]);
      } else {
        // 두 번째 월 클릭 — 두 월(순서 무관)을 아우르는 범위로.
        const lo = Math.min(anchorMonth, preset.month);
        const hi = Math.max(anchorMonth, preset.month);
        const loP = presets.find((p) => p.month === lo);
        const hiP = presets.find((p) => p.month === hi);
        if (loP && hiP) onChange([loP.value[0].format(format), hiP.value[1].format(format)]);
        setAnchorMonth(null);
      }
    } else {
      // 월 외 프리셋 클릭 — 앵커 리셋 후 그대로 적용.
      setAnchorMonth(null);
      onChange([preset.value[0].format(format), preset.value[1].format(format)]);
    }
  };
  // 문자열 → Dayjs 변환
  const dayjsValue: [Dayjs | null, Dayjs | null] | undefined = value
    ? [
        value[0] ? dayjs(value[0], format) : null,
        value[1] ? dayjs(value[1], format) : null,
      ]
    : undefined;

  const handleChange = (
    dates: [Dayjs | null, Dayjs | null] | null,
  ) => {
    setAnchorMonth(null); // 달력 직접 선택 시 월 범위 앵커 리셋
    if (dates) {
      onChange([
        dates[0] ? dates[0].format(format) : null,
        dates[1] ? dates[1].format(format) : null,
      ]);
    } else {
      onChange([null, null]);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width }}>
      {label && <Text>{label}</Text>}
      <RangePicker
        value={dayjsValue}
        onChange={handleChange}
        format={format}
        allowClear
        placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, width: '100%', height: 40 }}
        panelRender={(panelNode) => (
          <div>
            <div style={{
              padding: '10px 12px 8px',
              borderBottom: '1px solid #f0f0f0',
              width: '100%',
              boxSizing: 'border-box',
            }}>
              {presetRows.map((row, rowIndex) => (
                <div key={rowIndex} style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`,
                  gap: 4,
                  marginTop: rowIndex === 0 ? 0 : 4,
                }}>
                  {row.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handlePresetClick(preset)}
                      style={{
                        height: 28,
                        minWidth: 0,
                        padding: row.length >= 12 ? '0 2px' : '0 6px',
                        border: preset.month != null && preset.month === anchorMonth
                          ? '1px solid #1F6F78' : '1px solid #d9d9d9',
                        borderRadius: 4,
                        background: preset.month != null && preset.month === anchorMonth
                          ? '#e6f4f1' : '#fff',
                        color: preset.month != null && preset.month === anchorMonth
                          ? '#1F6F78' : '#334155',
                        fontSize: row.length >= 12 ? 11 : 12,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {panelNode}
          </div>
        )}
      />
    </div>
  );
};

export default DateRangePicker;
