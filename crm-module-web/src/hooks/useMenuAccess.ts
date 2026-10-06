import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { permissionApi } from '@/api/permission.api';
import { MENU_ITEMS, filterMenuByKeys, filterMenuByRole, type AppMenuItem } from '@/components/layout/menuItems';

/**
 * 로그인 사용자가 볼 메뉴.
 * 서버의 메뉴 권한 설정을 우선 쓰고, 아직 못 받았거나 백엔드가 구버전이면
 * 기존 역할 기반 필터로 떨어져 화면이 비지 않게 한다.
 */
export function useMenuAccess(): { items: AppMenuItem[]; scopes: Record<string, string>; menuKeys: Set<string> | null } {
  const { user, isAuthenticated } = useAuthStore();

  const { data } = useQuery({
    queryKey: ['my-access', user?.id],
    queryFn: () => permissionApi.myAccess(),
    enabled: isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const items = useMemo(() => {
    if (data?.menuKeys && data.menuKeys.length > 0) {
      return filterMenuByKeys(MENU_ITEMS, new Set(data.menuKeys));
    }
    return filterMenuByRole(MENU_ITEMS, user?.role, user?.deptCd);
  }, [data, user?.role, user?.deptCd]);

  // 메뉴 밖 버튼(예: 매출현황 안 '매출리스트')의 노출 판정용. null = 서버 설정을 아직 못 받음(역할 폴백 중) → 호출 쪽에서 보여준다.
  const menuKeys = useMemo(() => (data?.menuKeys && data.menuKeys.length > 0 ? new Set(data.menuKeys) : null), [data]);
  return { items, scopes: data?.scopes ?? {}, menuKeys };
}
