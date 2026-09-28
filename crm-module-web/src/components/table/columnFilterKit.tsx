import { useState, useEffect, useRef } from 'react';
import { Select, Input, InputNumber, Checkbox, Button, Popover, Tooltip } from 'antd';
import { FilterOutlined, CaretUpOutlined, CaretDownOutlined, PlusOutlined } from '@ant-design/icons';
import { FilterPresetPanel, type FilterPresetPanelHandle } from './FilterPresetPanel';
import { columnFilterPresetCache } from '@/api/columnFilterPreset.api';

/**
 * 매출목록/매출리스트(내·외부) 공용 — 헤더 컬럼별 조건 필터 + 정렬(전부 프론트 처리).
 * 페이지는 컬럼별 타입(COL_TYPES) + 값 추출(getVal) + enum 옵션만 제공하면 된다.
 */
export type ColType = 'text' | 'amount' | 'enum';
export interface ColFilter { op: string; values: string[]; value2?: string; excludeBlank?: boolean }

export function isColFilterActive(f?: ColFilter): boolean {
  if (!f) return false;
  return (f.values && f.values.some((v) => v !== '' && v != null)) || !!f.value2 || !!f.excludeBlank;
}

/** 추출된 문자열 값 하나가 필터 조건에 맞는지. */
export function matchesFilter(raw: string, type: ColType, f: ColFilter): boolean {
  const blank = raw.trim() === '';
  if (f.excludeBlank && blank) return false;
  if (type === 'amount') {
    const n = Number(raw) || 0;
    const a = f.values?.[0] !== undefined && f.values[0] !== '' ? Number(f.values[0]) : null;
    const b = f.value2 !== undefined && f.value2 !== '' ? Number(f.value2) : null;
    if (f.op === 'LTE') return a == null || n <= a;
    if (f.op === 'BETWEEN') return (a == null || n >= a) && (b == null || n <= b);
    return a == null || n >= a; // GTE
  }
  if (type === 'enum') {
    if (!f.values?.length) return true;
    return f.values.includes(raw);
  }
  const s = raw.toLowerCase();
  const vals = (f.values ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean);
  if (!vals.length) return true;
  if (f.op === 'EQUALS') return vals.some((v) => s === v);
  if (f.op === 'NOT_CONTAINS') return vals.every((v) => !s.includes(v));
  return vals.some((v) => s.includes(v)); // CONTAINS
}

/** 정렬 비교 — amount 는 숫자, 그 외 한글 로케일 문자열. */
export function compareVals(a: string, b: string, type: ColType): number {
  if (type === 'amount') return (Number(a) || 0) - (Number(b) || 0);
  return a.localeCompare(b, 'ko');
}

const TEXT_OPS = [{ value: 'CONTAINS', label: '포함' }, { value: 'EQUALS', label: '일치' }, { value: 'NOT_CONTAINS', label: '제외' }];
const AMOUNT_OPS = [{ value: 'GTE', label: '이상' }, { value: 'LTE', label: '이하' }, { value: 'BETWEEN', label: '사이' }];

/**
 * 헤더 셀 — 라벨(클릭 정렬 토글) + 정렬표시 + 필터 팝오버.
 * 팝오버 구성(2026-09-02 개편): [조건 입력 한 줄: 조건 · 값 · +저장] → [저장된 조건 체크 목록] → [바닥: 빈값 제외 · 초기화 · 적용]
 *   조건(포함/제외/이상/이하/사이)에 따라 값 칸이 바뀐다. enum(선택형) 컬럼은 체크 목록만 있고 저장 기능 없음.
 *   저장된 조건 체크 = 입력칸에 채우기만. 실제 검색은 "적용"을 눌러야 하고 그때 팝업이 닫힌다.
 *   (체크 즉시 적용하면 페이지가 컬럼을 다시 만들며 팝업이 닫혀 여러 개 고르기 불편 — 2026-09-03 현업 피드백)
 */
export function HeaderCell({ colId, label, type, enumOptions, filter, sortDir, onToggleSort, onApply, onClear, quickFilter,
  sortable = true, filterable = true }: {
  colId: string; label: string; type: ColType;
  enumOptions?: { label: string; value: string }[];
  filter?: ColFilter;
  sortDir?: 'asc' | 'desc';
  onToggleSort: () => void;
  onApply: (colId: string, f: ColFilter) => void;
  onClear: (colId: string) => void;
  /** 컬럼별 즉시 토글 필터(예: 부분정산만/부분매출만) — 있으면 팝오버 상단에 체크박스로 노출. */
  quickFilter?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
  /** 서버 페이징 화면에서 서버가 정렬/필터를 지원하지 않는 컬럼은 아이콘 자체를 숨긴다.
   *  (누른 뒤 "지원하지 않습니다" 안내를 띄우는 것보다, 처음부터 안 보이는 편이 명확하다)
   *  전량조회+프론트 처리 화면은 기본값 true 라 기존 동작 그대로. */
  sortable?: boolean;
  filterable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState('CONTAINS');
  const [text, setText] = useState('');
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const [enumVals, setEnumVals] = useState<string[]>([]);
  const [excludeBlank, setExcludeBlank] = useState(false);
  const presetRef = useRef<FilterPresetPanelHandle>(null);
  // 화면 진입 시 이 화면의 저장된 조건을 한 번만 미리 받아 둔다(헤더셀이 여러 개여도 요청은 1회로 합쳐짐).
  useEffect(() => {
    if (type !== 'enum') columnFilterPresetCache.prefetch(window.location.pathname);
  }, [type]);
  useEffect(() => {
    if (!open) return;
    setOp(filter?.op ?? (type === 'amount' ? 'GTE' : 'CONTAINS'));
    setText((filter?.values ?? []).join(', '));
    setV1(filter?.values?.[0] ?? '');
    setV2(filter?.value2 ?? '');
    setEnumVals(filter?.values ?? []);
    setExcludeBlank(!!filter?.excludeBlank);
  }, [open, filter, type]);

  /** 팝오버에 입력된 현재 조건 → ColFilter. 적용·저장 공통. */
  const buildDraft = (): ColFilter => {
    if (type === 'amount') return { op, values: [v1], value2: op === 'BETWEEN' ? v2 : undefined, excludeBlank };
    if (type === 'enum') return { op: 'IN', values: enumVals, excludeBlank };
    return { op, values: text.split(',').map((s) => s.trim()).filter(Boolean), excludeBlank };
  };
  const apply = () => {
    onApply(colId, buildDraft());
    setOpen(false);
  };
  /** 저장된 조건 체크 결과를 입력칸에 채운다(적용은 안 함 — "적용" 버튼에서). null 이면 값만 비운다. */
  const loadDraft = (f: ColFilter | null) => {
    if (!f) { setText(''); setV1(''); setV2(''); return; }
    setOp(f.op);
    if (type === 'amount') { setV1(f.values?.[0] ?? ''); setV2(f.value2 ?? ''); }
    else setText((f.values ?? []).join(', '));
  };
  const clear = () => { onClear(colId); setOpen(false); };

  const numInput = (val: string, set: (s: string) => void, placeholder: string) => (
    <InputNumber size="small" value={val === '' ? undefined : Number(val)} onChange={(v) => set(v == null ? '' : String(v))}
      placeholder={placeholder} style={{ flex: 1, minWidth: 0 }} controls={false}
      formatter={(v) => (v == null || String(v) === '' ? '' : Number(v).toLocaleString())}
      parser={(s) => Number(String(s ?? '').replace(/,/g, '')) as any}
      onPressEnter={apply} />
  );

  const sectionLabel: React.CSSProperties = { fontSize: 11, color: '#94a3b8', marginBottom: 6 };
  const savable = type !== 'enum';

  const content = (
    <div style={{ width: 280 }} onClick={(e) => e.stopPropagation()}>
      {quickFilter && (
        <Checkbox checked={quickFilter.checked} onChange={(e) => quickFilter.onChange(e.target.checked)}
          style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f1f5f9', width: '100%' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#d46b08' }}>{quickFilter.label}</span>
        </Checkbox>
      )}

      {/* ── 조건 입력 ── */}
      <div style={{ paddingBottom: 8 }}>
        <div style={sectionLabel}>조건 입력</div>
        {type === 'enum' ? (
          <Checkbox.Group value={enumVals} onChange={(v) => setEnumVals(v as string[])}
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }} options={enumOptions ?? []} />
        ) : (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Select size="small" value={op} onChange={setOp} style={{ width: 74, flexShrink: 0 }}
              options={type === 'amount' ? AMOUNT_OPS : TEXT_OPS} />
            {type === 'amount' ? (
              <>
                {numInput(v1, setV1, op === 'BETWEEN' ? '값1' : '값')}
                {op === 'BETWEEN' && (<><span style={{ color: '#94a3b8' }}>~</span>{numInput(v2, setV2, '값2')}</>)}
              </>
            ) : (
              <Input size="small" value={text} onChange={(e) => setText(e.target.value)} placeholder="값 (콤마로 여러 개)"
                onPressEnter={apply} style={{ flex: 1, minWidth: 0 }} />
            )}
            <Tooltip title="이 조건을 저장">
              <Button size="small" icon={<PlusOutlined />} onClick={() => presetRef.current?.save()} style={{ flexShrink: 0 }} />
            </Tooltip>
          </div>
        )}
        {savable && type === 'amount' && op === 'BETWEEN' && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>사이는 이상·이하 두 줄로 저장됩니다</div>
        )}
      </div>

      {/* ── 저장된 조건 (enum 제외) ── */}
      {savable && (
        <FilterPresetPanel ref={presetRef} colId={colId} type={type} applied={filter} getCurrent={buildDraft}
          onSelect={loadDraft} />
      )}

      {/* ── 바닥 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: '1px solid #f1f5f9', marginTop: 6, paddingTop: 8 }}>
        <Checkbox checked={excludeBlank} onChange={(e) => setExcludeBlank(e.target.checked)}>
          <span style={{ fontSize: 12 }}>빈값 제외</span>
        </Checkbox>
        <span style={{ display: 'inline-flex', gap: 6 }}>
          <Button size="small" onClick={clear}>초기화</Button>
          <Button size="small" type="primary" onClick={apply}>적용</Button>
        </span>
      </div>
    </div>
  );

  const active = isColFilterActive(filter) || !!quickFilter?.checked;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', minWidth: 0 }}>
      {/* 라벨은 좁아지면 …로 줄이고, 정렬·필터 아이콘은 항상 보이도록(flexShrink:0) — 컬럼 리사이즈 시 헤더 한 줄 유지. */}
      <span
        style={{ cursor: sortable ? 'pointer' : 'default', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
        title={label}
        onClick={sortable ? onToggleSort : undefined}
      >{label}</span>
      {sortable && (
        <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 0.7, cursor: 'pointer', flexShrink: 0 }} onClick={onToggleSort}>
          <CaretUpOutlined style={{ fontSize: 9, color: sortDir === 'asc' ? '#1F6F78' : '#cbd5e1' }} />
          <CaretDownOutlined style={{ fontSize: 9, color: sortDir === 'desc' ? '#1F6F78' : '#cbd5e1' }} />
        </span>
      )}
      {filterable && (
        <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottom" content={content} destroyTooltipOnHide>
          <FilterOutlined onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 12, marginLeft: 2, cursor: 'pointer', color: active ? '#1F6F78' : '#94a3b8', flexShrink: 0 }} />
        </Popover>
      )}
    </div>
  );
}
