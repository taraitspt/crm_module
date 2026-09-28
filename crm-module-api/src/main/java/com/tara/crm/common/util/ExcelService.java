package com.tara.crm.common.util;

import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

@Service
@Slf4j
public class ExcelService {

    /**
     * 엑셀 다운로드용 바이트 배열 생성
     *
     * @param headers 컬럼 헤더 배열 (예: {"주문번호", "발주번호", "업체명", ...})
     * @param data    행 데이터 리스트 (각 행 = Object 배열)
     * @return .xlsx 바이트 배열
     */
    public byte[] exportToExcel(String[] headers, List<Object[]> data) {
        long startedAt = System.currentTimeMillis();
        // 줄 단위 스트리밍(SXSSF, #422 2026-09-10) — 종전 XSSF 는 전체 셀을 메모리에 들고 있다가 마지막에 써서
        //   외주정산 전체(4,500줄×16열)가 쿼리 0.2초인데 다운로드 6초였다. 메모리엔 100줄만 유지하고 나머지는 임시파일로 흘려 쓴다.
        try (org.apache.poi.xssf.streaming.SXSSFWorkbook workbook = new org.apache.poi.xssf.streaming.SXSSFWorkbook(100)) {
            Sheet sheet = workbook.createSheet("Sheet1");

            // --- Header style ---
            CellStyle headerStyle = workbook.createCellStyle();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerFont.setFontHeightInPoints((short) 11);
            headerStyle.setFont(headerFont);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            headerStyle.setBorderBottom(BorderStyle.THIN);
            headerStyle.setBorderTop(BorderStyle.THIN);
            headerStyle.setBorderLeft(BorderStyle.THIN);
            headerStyle.setBorderRight(BorderStyle.THIN);
            headerStyle.setAlignment(HorizontalAlignment.CENTER);

            // --- Number style (금액 컬럼용) ---
            CellStyle numberStyle = workbook.createCellStyle();
            DataFormat format = workbook.createDataFormat();
            numberStyle.setDataFormat(format.getFormat("#,##0"));

            // --- Date style ---
            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(format.getFormat("yyyy-mm-dd"));

            // --- Write headers ---
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            // --- Write data rows ---
            // 열 너비는 글자 수로 계산한다(#422, 2026-09-10). 종전 sheet.autoSizeColumn() 은 서버 글꼴로 글자 폭을 실제로 재서
            //   리눅스 서버의 한글 데이터에서 매우 느렸다 — 외주정산 전체 4,500줄 × 16열이 30초를 넘겨 화면이 먼저 끊김(nginx 499).
            int[] maxLen = new int[headers.length];
            for (int i = 0; i < headers.length; i++) maxLen[i] = displayLength(headers[i]);
            for (int rowIdx = 0; rowIdx < data.size(); rowIdx++) {
                Row row = sheet.createRow(rowIdx + 1);
                Object[] rowData = data.get(rowIdx);
                for (int colIdx = 0; colIdx < rowData.length; colIdx++) {
                    Cell cell = row.createCell(colIdx);
                    Object value = rowData[colIdx];
                    String text;

                    if (value == null) {
                        cell.setCellValue("");
                        text = "";
                    } else if (value instanceof Number) {
                        cell.setCellValue(((Number) value).doubleValue());
                        cell.setCellStyle(numberStyle);
                        text = String.format("%,d", ((Number) value).longValue());
                    } else if (value instanceof java.time.LocalDate ld) {
                        text = ld.toString();
                        cell.setCellValue(text);
                    } else if (value instanceof java.time.LocalDateTime ldt) {
                        text = ldt.toString();
                        cell.setCellValue(text);
                    } else {
                        text = value.toString();
                        cell.setCellValue(text);
                    }
                    if (colIdx < maxLen.length) maxLen[colIdx] = Math.max(maxLen[colIdx], displayLength(text));
                }
            }

            // --- Column widths (글자 수 기반, 최소 3000 · 최대 60자) ---
            for (int i = 0; i < headers.length; i++) {
                int chars = Math.min(maxLen[i], 60);
                sheet.setColumnWidth(i, Math.max(3000, chars * 256 + 1024));
            }

            // --- Write to byte array ---
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            workbook.dispose();   // SXSSF 임시파일 정리
            byte[] bytes = out.toByteArray();
            log.info("엑셀 생성: {}줄 × {}열, {}KB, {}ms", data.size(), headers.length, bytes.length / 1024, System.currentTimeMillis() - startedAt);
            return bytes;

        } catch (IOException e) {
            log.error("엑셀 생성 실패", e);
            throw new BusinessException(ErrorCode.EXCEL_EXPORT_FAILED);
        }
    }

    /** 표시 폭 추정 — 한글 등 전각 문자는 2칸, 그 외 1칸. 줄바꿈이 있으면 가장 긴 줄 기준. */
    private static int displayLength(String text) {
        if (text == null || text.isEmpty()) return 0;
        int best = 0;
        for (String line : text.split("\n")) {
            int len = 0;
            for (int i = 0; i < line.length(); i++) len += line.charAt(i) > 0x7F ? 2 : 1;
            best = Math.max(best, len);
        }
        return best;
    }

    /**
     * 외주정산 전용 엑셀 파싱
     * Expected columns (0-based):
     *   0: 주문번호, 1: 발주번호, 2: 주문명, 3: 작업명,
     *   4: 업체명, 5: 수량, 6: 단가, 7: 금액
     */
    public List<ExcelParsedRow> parseSettlementRows(MultipartFile file) {
        validateFile(file);

        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {

            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) {
                throw new BusinessException(ErrorCode.EXCEL_INVALID);
            }

            List<ExcelParsedRow> rows = new ArrayList<>();

            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                ExcelParsedRow parsed = new ExcelParsedRow();
                parsed.setRowIndex(i + 1); // 1-based for user display
                parsed.setValues(new String[8]);

                for (int col = 0; col < 8; col++) {
                    Cell cell = row.getCell(col);
                    parsed.getValues()[col] = getCellValueAsString(cell);
                }
                rows.add(parsed);
            }
            return rows;

        } catch (BusinessException e) {
            throw e;
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.EXCEL_IMPORT_FAILED);
        }
    }

    /**
     * 시트 #9 — 카드매출 엑셀 파싱 (가변 컬럼 — 헤더 기반 매핑).
     * Header row 의 컬럼명에 따라 자동 매핑. 인식 헤더:
     *   매출일 / 거래처 / 카드사 / 카드번호 / 승인번호 / 승인일시 / 할부 / 공급가액 / 세액 / 합계 / 주문번호 / 비고
     */
    public List<java.util.Map<String, String>> parseCardSalesRows(MultipartFile file) {
        validateFile(file);
        try (InputStream is = file.getInputStream();
             Workbook workbook = new XSSFWorkbook(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) throw new BusinessException(ErrorCode.EXCEL_INVALID);
            Row header = sheet.getRow(0);
            if (header == null) return java.util.Collections.emptyList();
            int cols = header.getLastCellNum();
            String[] headerNames = new String[cols];
            for (int c = 0; c < cols; c++) {
                headerNames[c] = getCellValueAsString(header.getCell(c));
            }
            List<java.util.Map<String, String>> rows = new ArrayList<>();
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                java.util.Map<String, String> map = new java.util.LinkedHashMap<>();
                boolean any = false;
                for (int c = 0; c < cols; c++) {
                    String v = getCellValueAsString(row.getCell(c));
                    if (v != null && !v.isBlank()) any = true;
                    map.put(headerNames[c], v);
                }
                if (any) rows.add(map);
            }
            return rows;
        } catch (BusinessException e) {
            throw e;
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.EXCEL_IMPORT_FAILED);
        }
    }

    // --- Helper types ---

    @lombok.Getter @lombok.Setter
    public static class ExcelParsedRow {
        private int rowIndex;
        private String[] values;
    }

    // --- Private helpers ---

    private void validateFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.EXCEL_EMPTY);
        }
        String filename = file.getOriginalFilename();
        if (filename == null || (!filename.endsWith(".xlsx") && !filename.endsWith(".xls"))) {
            throw new BusinessException(ErrorCode.EXCEL_INVALID_FORMAT);
        }
        // Max 10MB
        if (file.getSize() > 10 * 1024 * 1024) {
            throw new BusinessException(ErrorCode.EXCEL_TOO_LARGE);
        }
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getLocalDateTimeCellValue().toLocalDate().toString();
                }
                // Remove decimal point for integer-like numbers
                double val = cell.getNumericCellValue();
                if (val == Math.floor(val) && !Double.isInfinite(val)) {
                    yield String.valueOf((long) val);
                }
                yield String.valueOf(val);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try {
                    yield String.valueOf(cell.getNumericCellValue());
                } catch (Exception e) {
                    yield cell.getStringCellValue();
                }
            }
            default -> "";
        };
    }
}
