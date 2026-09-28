import React from 'react';
import { Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';

export interface ExcelColumn {
  /** 엑셀 헤더 이름 */
  header: string;
  /** 데이터 객체의 키 */
  key: string;
  /** 값 포맷터 (선택). 2번째 인자로 행 전체(row)를 받아 다른 필드 참조 가능(예: 상태 라벨이 salesType 의존). */
  formatter?: (value: unknown, row?: Record<string, unknown>) => string | number;
}

export interface ExcelSheet {
  sheetName: string;
  data: Record<string, unknown>[];
  columns: ExcelColumn[];
}

interface ExcelDownloadBtnProps {
  /** 엑셀에 출력할 데이터 */
  data: Record<string, unknown>[];
  /**
   * 다운로드 직전 전체 데이터를 비동기로 가져오는 함수(선택).
   * 지정 시 `data`(현재 페이지) 대신 이 결과로 엑셀을 만든다 — 페이징된 목록 전체 내보내기용.
   */
  fetchData?: () => Promise<Record<string, unknown>[]>;
  /** 여러 시트를 동적으로 구성할 때 사용한다. 지정하면 단일 시트 설정보다 우선한다. */
  fetchSheets?: () => Promise<ExcelSheet[]>;
  /** 컬럼 정의 */
  columns: ExcelColumn[];
  /** 파일명 (확장자 제외) */
  fileName: string;
  /** 시트명 */
  sheetName?: string;
  /** 버튼 텍스트 */
  label?: string;
  /** 로딩 상태 */
  loading?: boolean;
}

/**
 * 엑셀 다운로드 버튼.
 * SheetJS(xlsx)를 사용하여 현재 데이터를 .xlsx 파일로 내보낸다.
 */
const ExcelDownloadBtn: React.FC<ExcelDownloadBtnProps> = ({
  data,
  fetchData,
  fetchSheets,
  columns,
  fileName,
  sheetName = 'Sheet1',
  label = '엑셀다운로드',
  loading = false,
}) => {
  const [fetching, setFetching] = React.useState(false);
  const handleDownload = async () => {
    if (fetchSheets) {
      try {
        setFetching(true);
        const sheets = await fetchSheets();
        const workbook = XLSX.utils.book_new();
        sheets.forEach((sheet) => {
          const headers = sheet.columns.map((col) => col.header);
          const rows = sheet.data.map((row) => sheet.columns.map((col) => {
            const value = row[col.key];
            return col.formatter ? col.formatter(value) : value;
          }));
          const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
          worksheet['!cols'] = sheet.columns.map((col) => ({ wch: Math.max(col.header.length * 2, 12) }));
          XLSX.utils.book_append_sheet(workbook, worksheet, sheet.sheetName);
        });
        XLSX.writeFile(workbook, `${fileName}.xlsx`);
        message.success('엑셀 파일을 다운로드했습니다.');
      } catch {
        message.error('엑셀 데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setFetching(false);
      }
      return;
    }
    let rowsData = data;
    if (fetchData) {
      try {
        setFetching(true);
        rowsData = await fetchData();
      } catch {
        message.error('전체 데이터를 불러오는 중 오류가 발생했습니다.');
        setFetching(false);
        return;
      }
      setFetching(false);
    }
    if (rowsData.length === 0) {
      message.warning('다운로드할 데이터가 없습니다.');
      return;
    }

    try {
      // 헤더 행
      const headers = columns.map((col) => col.header);

      // 데이터 행 생성
      const rows = rowsData.map((row) =>
        columns.map((col) => {
          const value = row[col.key];
          return col.formatter ? col.formatter(value, row) : value;
        })
      );

      // 워크시트 생성
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // 컬럼 너비 자동 조정
      worksheet['!cols'] = columns.map((col) => ({
        wch: Math.max(col.header.length * 2, 12),
      }));

      // 워크북 생성 및 다운로드
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${fileName}.xlsx`);

      message.success('엑셀 파일이 다운로드되었습니다.');
    } catch {
      message.error('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  return (
    <Button
      icon={<DownloadOutlined />}
      onClick={handleDownload}
      loading={loading || fetching}
    >
      {label}
    </Button>
  );
};

export default ExcelDownloadBtn;
