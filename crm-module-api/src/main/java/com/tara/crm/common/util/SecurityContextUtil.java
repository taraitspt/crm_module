package com.tara.crm.common.util;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Map;

public final class SecurityContextUtil {

    private SecurityContextUtil() {}

    public static String getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) return null;
        return auth.getPrincipal().toString();
    }

    public static String getCurrentRole() {
        Map<String, Object> details = getDetailsMap();
        if (details == null) return null;
        return (String) details.get("role");
    }

    public static Integer getCurrentDepartmentCd() {
        Map<String, Object> details = getDetailsMap();
        if (details == null) return null;
        Object deptCd = details.get("deptCd");
        return deptCd != null ? ((Number) deptCd).intValue() : null;
    }

    public static Integer getCurrentCompanyCd() {
        Map<String, Object> details = getDetailsMap();
        if (details == null) return null;
        Object companyCd = details.get("companyCd");
        return companyCd != null ? ((Number) companyCd).intValue() : null;
    }

    /** plantCd — 운영 MySQL 의 모든 row 가 plant_cd=1000 으로 저장되어 있어
     *  디폴트는 1000 으로 복원. 토큰에 명시된 plantCd 가 있으면 그 값 사용. */
    public static final int DEFAULT_PLANT_CD = 2000;

    public static Integer getCurrentPlantCd() {
        Map<String, Object> details = getDetailsMap();
        if (details == null) return DEFAULT_PLANT_CD;
        Object plantCd = details.get("plantCd");
        return plantCd != null ? ((Number) plantCd).intValue() : DEFAULT_PLANT_CD;
    }

    public static String getCurrentUserName() {
        Map<String, Object> details = getDetailsMap();
        if (details == null) return null;
        return (String) details.get("name");
    }

    /** 사원번호(employeeNo) — getCurrentUserId()(로그인 아이디)와 별개. 목표 salesEmpId 등과 매칭용. */
    public static String getCurrentEmployeeNo() {
        Map<String, Object> details = getDetailsMap();
        if (details == null) return null;
        return (String) details.get("employeeNo");
    }

    public static boolean isAdmin() {
        return "ADMIN".equals(getCurrentRole());
    }

    /** 외부 API 클라이언트 토큰이면 api_client.id, 일반 로그인 토큰이면 null. */
    public static Long getCurrentApiClientId() {
        Map<String, Object> details = getDetailsMap();
        if (details == null) return null;
        Object v = details.get("apiClientId");
        return v != null ? ((Number) v).longValue() : null;
    }

    public static Integer getCurrentTokenVersion() {
        Map<String, Object> details = getDetailsMap();
        if (details == null) return null;
        Object v = details.get("tokenVer");
        return v != null ? ((Number) v).intValue() : null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> getDetailsMap() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getDetails() instanceof Map<?, ?>)) return null;
        return (Map<String, Object>) auth.getDetails();
    }
}
