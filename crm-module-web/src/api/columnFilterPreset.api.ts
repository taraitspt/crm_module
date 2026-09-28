import apiClient from './client';
import type { ApiResponse } from '@/types/common';

/** 컬럼 필터 저장조건 1건 — 조건 하나 + 값 하나. 서버 저장, 로그인 사용자 본인 것만. */
export interface ColumnFilterPresetItem {
  presetId: number;
  columnId: string;
  filterOp: string;
  filterValue: string;
}

export const columnFilterPresetApi = {
  /** columnId 를 빼면 화면 전체(모든 컬럼) — 화면 진입 시 1회 선조회용. */
  list: async (pagePath: string, columnId?: string): Promise<ColumnFilterPresetItem[]> => {
    const res = await apiClient.get<ApiResponse<ColumnFilterPresetItem[]>>('/column-filter-presets', {
      params: { pagePath, columnId },
    });
    return res.data?.data ?? [];
  },
  /** 값마다 1행 저장. 이미 있는 (조건,값) 은 서버가 건너뜀. 저장 후 그 컬럼의 전체 목록을 돌려준다. */
  save: async (payload: { pagePath: string; columnId: string; filterOp: string; filterValues: string[] })
    : Promise<ColumnFilterPresetItem[]> => {
    const res = await apiClient.post<ApiResponse<ColumnFilterPresetItem[]>>('/column-filter-presets', payload);
    return res.data?.data ?? [];
  },
  remove: async (presetId: number): Promise<void> => {
    await apiClient.delete<ApiResponse<void>>(`/column-filter-presets/${presetId}`);
  },
};

// ── 화면 단위 캐시 ────────────────────────────────────────────────────────
//  팝업을 열 때마다 서버를 부르면 목록이 한 박자 늦게 나타나 팝업이 튄다.
//  화면(경로) 단위로 한 번만 받아 두고, 팝업은 캐시에서 즉시 읽는다. 저장/삭제 후엔 캐시를 갱신한다.
const pageCache = new Map<string, ColumnFilterPresetItem[]>();
const inflight = new Map<string, Promise<ColumnFilterPresetItem[]>>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

export const columnFilterPresetCache = {
  /** 화면 전체 선조회(중복 호출은 하나로 합침). 이미 있으면 바로 반환. */
  prefetch(pagePath: string): Promise<ColumnFilterPresetItem[]> {
    const hit = pageCache.get(pagePath);
    if (hit) return Promise.resolve(hit);
    const running = inflight.get(pagePath);
    if (running) return running;
    const p = columnFilterPresetApi.list(pagePath)
      .then((list) => { pageCache.set(pagePath, list); notify(); return list; })
      .catch(() => [] as ColumnFilterPresetItem[])
      .finally(() => inflight.delete(pagePath));
    inflight.set(pagePath, p);
    return p;
  },
  /** 캐시에서 컬럼 목록 (없으면 undefined = 아직 안 받음). */
  get(pagePath: string, columnId: string): ColumnFilterPresetItem[] | undefined {
    const all = pageCache.get(pagePath);
    return all ? all.filter((p) => p.columnId === columnId) : undefined;
  },
  /** 한 컬럼의 목록을 통째로 교체(저장 응답 반영). */
  setColumn(pagePath: string, columnId: string, items: ColumnFilterPresetItem[]) {
    const rest = (pageCache.get(pagePath) ?? []).filter((p) => p.columnId !== columnId);
    pageCache.set(pagePath, [...rest, ...items.map((i) => ({ ...i, columnId }))]);
    notify();
  },
  removeOne(pagePath: string, presetId: number) {
    const all = pageCache.get(pagePath);
    if (!all) return;
    pageCache.set(pagePath, all.filter((p) => p.presetId !== presetId));
    notify();
  },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
