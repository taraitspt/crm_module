package com.tara.crm.common.util;

import com.querydsl.core.types.dsl.BooleanExpression;
import com.querydsl.core.types.dsl.DatePath;

import java.time.LocalDate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 목록 헤더의 '날짜 컬럼 텍스트 필터'를 날짜 조건으로 변환한다.
 *
 * 배경: 화면은 날짜를 YYYY-MM-DD 문자열로 보여주고 사용자는 '2026-08' 처럼 부분입력으로 거른다.
 *   이를 SQL 로 옮기려고 처음엔 date_format()/stringValue() 로 문자열을 만들어 LIKE 비교했는데,
 *   - date_format() : JPQL 표준 함수가 아니라 Hibernate 가 해석하지 못한다.
 *   - stringValue() : cast 결과 포맷이 DB/드라이버에 따라 달라 매칭이 안 됐다.
 *   → 문자열 변환을 아예 쓰지 않고, 입력을 파싱해 year()/month()/day() 비교로 바꾼다.
 *     전부 JPQL 표준 함수라 안전하고, 날짜 컬럼을 그대로 비교하므로 의미도 정확하다.
 */
public final class DateTextFilter {

    private DateTextFilter() {}

    private static final Pattern P_YMD = Pattern.compile("(\\d{4})[-./](\\d{1,2})[-./](\\d{1,2})");
    private static final Pattern P_YM  = Pattern.compile("(\\d{4})[-./](\\d{1,2})");
    private static final Pattern P_Y   = Pattern.compile("(\\d{4})");
    private static final Pattern P_MD  = Pattern.compile("(\\d{1,2})[-./](\\d{1,2})");

    /**
     * 입력 한 건 → 날짜 조건. 해석할 수 없으면 null.
     * 지원 형식: 2026-08-04 / 2026-08 / 2026 / 08-04 (구분자는 - . / 모두 허용)
     */
    public static BooleanExpression match(DatePath<LocalDate> path, String raw) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.isEmpty()) return null;

        Matcher m = P_YMD.matcher(v);
        if (m.matches()) {
            try {
                return path.eq(LocalDate.of(
                        Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3))));
            } catch (Exception e) {
                return null;   // 2026-13-45 같은 비정상 날짜
            }
        }
        m = P_YM.matcher(v);
        if (m.matches()) {
            int mm = Integer.parseInt(m.group(2));
            if (mm < 1 || mm > 12) return null;
            return path.year().eq(Integer.parseInt(m.group(1))).and(path.month().eq(mm));
        }
        m = P_Y.matcher(v);
        if (m.matches()) {
            return path.year().eq(Integer.parseInt(m.group(1)));
        }
        // 연도 없이 '08-04' 처럼 월-일만 입력한 경우 (기존 문자열 부분검색에서 되던 형태)
        m = P_MD.matcher(v);
        if (m.matches()) {
            int mm = Integer.parseInt(m.group(1));
            int dd = Integer.parseInt(m.group(2));
            if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
            return path.month().eq(mm).and(path.dayOfMonth().eq(dd));
        }
        return null;
    }

    /**
     * 일시(LocalDateTime) 컬럼용 — 화면이 'YYYY-MM-DD HH:mm' 으로 보여주는 값의 날짜 부분으로 매칭한다.
     * 같은 입력 형식을 지원하되, 하루 단위 입력은 그날 00:00 ~ 다음날 00:00 범위로 본다(시각 무관).
     */
    public static BooleanExpression matchDateTime(
            com.querydsl.core.types.dsl.DateTimePath<java.time.LocalDateTime> path, String raw) {
        if (raw == null) return null;
        String v = raw.trim();
        if (v.isEmpty()) return null;
        // 화면이 'YYYY-MM-DD HH:mm' 으로 보여주므로 셀 값을 그대로 붙여넣는 경우가 많다.
        //   뒤의 시각 부분을 떼고 날짜만으로 매칭한다(그러지 않으면 어떤 패턴에도 안 걸려 0건). (2026-09-04)
        v = v.replaceAll("\\s+\\d{1,2}:\\d{2}(:\\d{2})?$", "").trim();
        if (v.isEmpty()) return null;

        Matcher m = P_YMD.matcher(v);
        if (m.matches()) {
            try {
                LocalDate d = LocalDate.of(
                        Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
                return path.goe(d.atStartOfDay()).and(path.lt(d.plusDays(1).atStartOfDay()));
            } catch (Exception e) {
                return null;
            }
        }
        m = P_YM.matcher(v);
        if (m.matches()) {
            int mm = Integer.parseInt(m.group(2));
            if (mm < 1 || mm > 12) return null;
            return path.year().eq(Integer.parseInt(m.group(1))).and(path.month().eq(mm));
        }
        m = P_Y.matcher(v);
        if (m.matches()) {
            return path.year().eq(Integer.parseInt(m.group(1)));
        }
        m = P_MD.matcher(v);
        if (m.matches()) {
            int mm = Integer.parseInt(m.group(1));
            int dd = Integer.parseInt(m.group(2));
            if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
            return path.month().eq(mm).and(path.dayOfMonth().eq(dd));
        }
        return null;
    }
}
