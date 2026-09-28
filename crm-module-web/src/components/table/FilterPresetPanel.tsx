import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Checkbox, Popconfirm, message } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { columnFilterPresetApi, columnFilterPresetCache, type ColumnFilterPresetItem } from '@/api/columnFilterPreset.api';
import type { ColFilter, ColType } from './columnFilterKit';

/**
 * 컬럼 필터 "저장된 조건" 패널 (2026-09-02 현업 요청 — ERP 처럼 조건을 저장해 두고 체크로 선택/해제).
 * HeaderCell 필터 팝오버 안에 끼워 넣는 독립 컴포넌트. 저장 위치 = 서버(column_filter_preset), 사용자 본인 것만.
 *   저장조건 1개 = 조건 하나 + 값 하나 (ERP 와 같은 모양). "SK, LG" 를 저장하면 두 개로 나뉘어 저장된다.
 *   금액 "사이 1000~5000" 은 "이상 1000" + "이하 5000" 두 줄로 저장되고, 둘을 함께 체크하면 다시 범위로 걸린다.
 *   화면 식별 = window.location.pathname, 컬럼 식별 = colId → 같은 화면·같은 th 에서만 보인다.
 *   체크 = 즉시 적용, 해제 = 즉시 해제. 글자 조건은 같은 조건끼리 값이 합쳐진다(OR).
 *   저장 버튼은 HeaderCell 의 입력 줄에 있으므로 ref 로 save() 를 노출한다.
 */
export interface FilterPresetPanelHandle { save: () => Promise<void> }

const OP_LABELS: Record<string, string> = {
  CONTAINS: '포함', EQUALS: '일치', NOT_CONTAINS: '제외', GTE: '이상', LTE: '이하',
};

const fmtNum = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && v.trim() !== '' ? n.toLocaleString() : v;
};

/** 팝업을 열었을 때 적용 중인 필터에 들어 있는 (조건, 값) 을 체크 상태로 복원. */
function initialChecked(list: ColumnFilterPresetItem[], applied?: ColFilter): number[] {
  if (!applied?.op) return [];
  if (applied.op === 'BETWEEN') {
    const lo = (applied.values?.[0] ?? '').trim();
    const hi = (applied.value2 ?? '').trim();
    return list
      .filter((p) => (p.filterOp === 'GTE' && p.filterValue === lo) || (p.filterOp === 'LTE' && p.filterValue === hi))
      .map((p) => p.presetId);
  }
  const vals = new Set((applied.values ?? []).map((v) => v.trim()));
  return list.filter((p) => p.filterOp === applied.op && vals.has(p.filterValue)).map((p) => p.presetId);
}

export const FilterPresetPanel = forwardRef<FilterPresetPanelHandle, {
  colId: string;
  type: ColType;
  /** 현재 컬럼에 실제 적용돼 있는 필터 — 팝업을 열었을 때 체크 상태 복원용. */
  applied?: ColFilter;
  /** 팝오버에 현재 입력돼 있는 조건(저장 대상). */
  getCurrent: () => ColFilter;
  /** 체크 결과를 위 입력칸(초안)에 반영만 한다 — 실제 적용은 사용자가 "적용"을 누를 때.
   *  (체크마다 바로 적용하면 목록이 다시 그려지며 팝업이 닫혀 여러 개 고르기 불편 — 2026-09-03 현업 피드백)
   *  null = 전부 해제(입력칸 비움). */
  onSelect: (f: ColFilter | null) => void;
}>(function FilterPresetPanel({ colId, type, applied, getCurrent, onSelect }, ref) {
  const pagePath = window.location.pathname;
  // 캐시에 있으면 첫 렌더부터 목록을 그린다(팝업이 튀지 않게). 없으면 받아오는 동안 자리만 잡아 둔다.
  const cached = columnFilterPresetCache.get(pagePath, colId);
  const [presets, setPresets] = useState<ColumnFilterPresetItem[]>(cached ?? []);
  const [loaded, setLoaded] = useState(cached !== undefined);
  const [checked, setChecked] = useState<number[]>(() => initialChecked(cached ?? [], applied));

  useEffect(() => {
    let alive = true;
    const sync = () => {
      const list = columnFilterPresetCache.get(pagePath, colId);
      if (!alive || !list) return;
      setPresets(list);
      setLoaded(true);
    };
    const unsub = columnFilterPresetCache.subscribe(sync);
    if (cached === undefined) {
      columnFilterPresetCache.prefetch(pagePath).then((all) => {
        if (!alive) return;
        const list = all.filter((p) => p.columnId === colId);
        setPresets(list);
        setLoaded(true);
        setChecked(initialChecked(list, applied));
      });
    }
    return () => { alive = false; unsub(); };
    // applied/cached 는 팝업 열림 시점의 값만 보면 되므로 의존성에서 제외.
  }, [pagePath, colId]);

  const save = async () => {
    const f = getCurrent();
    // 사이(BETWEEN) → 이상 + 이하 두 줄. 그 외는 값마다 한 줄.
    const jobs: { op: string; values: string[] }[] = [];
    if (f.op === 'BETWEEN') {
      const lo = (f.values?.[0] ?? '').trim();
      const hi = (f.value2 ?? '').trim();
      if (lo) jobs.push({ op: 'GTE', values: [lo] });
      if (hi) jobs.push({ op: 'LTE', values: [hi] });
    } else {
      const values = (f.values ?? []).map((v) => v.trim()).filter(Boolean);
      if (values.length) jobs.push({ op: f.op, values });
    }
    if (jobs.length === 0) { message.warning('저장할 값이 없습니다. 조건을 먼저 입력하세요.'); return; }
    try {
      let next = presets;
      for (const j of jobs) {
        next = await columnFilterPresetApi.save({ pagePath, columnId: colId, filterOp: j.op, filterValues: j.values });
      }
      const added = next.length - presets.length;
      setPresets(next);
      columnFilterPresetCache.setColumn(pagePath, colId, next);
      message.success(added > 0 ? `${added}건 저장됨` : '이미 저장된 조건입니다.');
    } catch (e: any) {
      message.error(e?.response?.data?.message || '저장에 실패했습니다.');
    }
  };
  useImperativeHandle(ref, () => ({ save }), [save]);

  const remove = async (id: number) => {
    try {
      await columnFilterPresetApi.remove(id);
      const next = presets.filter((p) => p.presetId !== id);
      setPresets(next);
      columnFilterPresetCache.removeOne(pagePath, id);
      if (checked.includes(id)) applyChecked(checked.filter((c) => c !== id), next);
    } catch {
      message.error('삭제에 실패했습니다.');
    }
  };

  /** 체크 집합 → 필터 적용. */
  const applyChecked = (ids: number[], source: ColumnFilterPresetItem[] = presets) => {
    const picked = source.filter((p) => ids.includes(p.presetId));
    if (picked.length === 0) { setChecked([]); onSelect(null); return; }
    const last = picked[picked.length - 1];

    if (type === 'amount') {
      // 숫자: 이상 1개 + 이하 1개까지만 의미가 있다. 같은 조건이 둘이면 마지막 것만.
      const gte = [...picked].reverse().find((p) => p.filterOp === 'GTE');
      const lte = [...picked].reverse().find((p) => p.filterOp === 'LTE');
      const keep = [gte, lte].filter(Boolean) as ColumnFilterPresetItem[];
      if (keep.length !== picked.length) message.info('숫자 조건은 이상·이하 하나씩만 적용합니다.');
      setChecked(keep.map((p) => p.presetId));
      if (gte && lte) onSelect({ op: 'BETWEEN', values: [gte.filterValue], value2: lte.filterValue });
      else if (gte) onSelect({ op: 'GTE', values: [gte.filterValue] });
      else if (lte) onSelect({ op: 'LTE', values: [lte.filterValue] });
      return;
    }

    // 글자: 같은 조건끼리 값 합치기(OR). 조건이 섞이면 방금 체크한 조건만 남긴다.
    const sameOp = picked.filter((p) => p.filterOp === last.filterOp);
    if (sameOp.length !== picked.length) message.info('조건이 달라 방금 체크한 것만 적용합니다.');
    setChecked(sameOp.map((p) => p.presetId));
    onSelect({ op: last.filterOp, values: sameOp.map((p) => p.filterValue) });
  };

  const toggle = (id: number, on: boolean) => {
    applyChecked(on ? [...checked.filter((c) => c !== id), id] : checked.filter((c) => c !== id));
  };

  const isAmount = type === 'amount';
  const activeCount = checked.length;

  return (
    <div style={{ borderTop: '1px solid #f1f5f9', padding: '8px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          저장된 조건 {presets.length > 0 && <span>{presets.length}</span>}
          <span style={{ marginLeft: 4, color: '#cbd5e1' }}>(체크 후 적용)</span>
          {activeCount > 0 && (
            <span style={{ marginLeft: 6, color: '#1F6F78', fontWeight: 600 }}>
              {isAmount && activeCount === 2 ? '범위 선택' : `${activeCount}개 선택`}
            </span>
          )}
        </span>
        {activeCount > 0 && (
          <span style={{ fontSize: 11, color: '#1F6F78', cursor: 'pointer' }} onClick={() => applyChecked([])}>전체 해제</span>
        )}
      </div>
      {!loaded && (
        <div style={{ fontSize: 11, color: '#cbd5e1', minHeight: 22 }}>불러오는 중…</div>
      )}
      {loaded && presets.length === 0 && (
        <div style={{ fontSize: 11, color: '#94a3b8', minHeight: 22 }}>없음 — 위에 조건을 입력하고 + 를 누르면 저장됩니다.</div>
      )}
      {presets.length > 0 && (
        <div style={{ maxHeight: 150, overflowY: 'auto' }}>
          {presets.map((p) => {
            const on = checked.includes(p.presetId);
            return (
              <div key={p.presetId}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 6, marginBottom: 2,
                  background: on ? '#e6f4f1' : 'transparent' }}>
                <Checkbox checked={on} onChange={(e) => toggle(p.presetId, e.target.checked)} style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, display: 'inline-flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: '#64748b', background: on ? '#fff' : '#f1f5f9', padding: '0 5px', borderRadius: 4, flexShrink: 0 }}>
                      {OP_LABELS[p.filterOp] ?? p.filterOp}
                    </span>
                    <span title={p.filterValue}
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontVariantNumeric: isAmount ? 'tabular-nums' : undefined }}>
                      {isAmount ? fmtNum(p.filterValue) : p.filterValue}
                    </span>
                  </span>
                </Checkbox>
                <Popconfirm title="이 조건을 삭제할까요?" okText="삭제" cancelText="취소" onConfirm={() => remove(p.presetId)}>
                  <CloseOutlined style={{ fontSize: 10, color: '#94a3b8', cursor: 'pointer', flexShrink: 0 }} />
                </Popconfirm>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
