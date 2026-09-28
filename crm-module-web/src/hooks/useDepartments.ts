import { useQuery } from '@tanstack/react-query';
import apiClient from '@/api/client';
import type { ApiResponse } from '@/types/common';

export interface Department {
  id: number;
  name: string;
}

export const useDepartments = (plantCd?: number) => {
  const { data, isLoading } = useQuery({
    queryKey: ['departments', plantCd ?? null],
    queryFn: async () => {
      const params = plantCd != null ? { plantCd } : {};
      const response = await apiClient.get<ApiResponse<any[]>>('/lookup/departments', { params });
      return (response.data.data || []).map((d: any) => ({
        id: d.deptCd,
        name: d.deptNm,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    departments: data ?? [],
    isLoading,
  };
};
