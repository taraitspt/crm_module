import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  drawerVisible: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setDrawerVisible: (visible: boolean) => void;
  toggleDrawer: () => void;
}

/**
 * UI 전역 상태 관리 (사이드바 접힘 여부, 모바일 드로어 등)
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      drawerVisible: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setDrawerVisible: (visible) => set({ drawerVisible: visible }),
      toggleDrawer: () => set((state) => ({ drawerVisible: !state.drawerVisible })),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }), // drawerVisible은 저장하지 않음
    }
  )
);
