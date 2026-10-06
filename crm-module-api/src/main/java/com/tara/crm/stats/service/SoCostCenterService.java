package com.tara.crm.stats.service;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.entity.User;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.auth.repository.UserRepository;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.stats.repository.OracleSoCostCenterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 수주 담당팀 점검 — 수주 라인의 비용센터(SD_SO_DTL.CC_CD — 거래처 기본값 MA_PARTNERSA_INFO.CC_CD 가 아니다)와 영업담당자의 실제 소속(ERP HR_EMPINFO_DTL.CC_CD, 없으면 CRM users.cc_cd)을 대조.
 * 해외영업2팀 담당자가 1팀 CC 로 수주를 올리는 식의 오등록을 찾는다(사용자 요청 2026-10-06).
 *
 * <p>판정 ccMatch: MATCH(같음) / MISMATCH(다름) / NO_CC(담당자는 있는데 비용센터가 ERP 사원정보·CRM 사용자 어디에도 없음) / NO_USER(담당 사번이 ERP 사원·CRM 사용자 어디에도 없음).
 * 비교는 비용센터 코드로 한다 — 부서(dept_cd)는 CC 와 1:1 이 아니어서 참고용으로만 같이 내려준다.
 */
@Service
@RequiredArgsConstructor
public class SoCostCenterService {

    private final Optional<OracleSoCostCenterRepository> oracle;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;

    public List<Map<String, Object>> check(LocalDate start, LocalDate end) {
        OracleSoCostCenterRepository repo = oracle.orElseThrow(() -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Map<String, User> byEmpNo = new HashMap<>();
        for (User u : userRepository.findAllByCompanyCd(companyCd)) {
            if (u.getEmployeeNo() != null && !u.getEmployeeNo().isBlank()) byEmpNo.putIfAbsent(u.getEmployeeNo().trim(), u);
        }
        Map<Integer, String> deptNames = departmentRepository.findAllByCompanyCd(companyCd).stream()
                .collect(Collectors.toMap(d -> d.getId().getDeptCd(), Department::getDeptNm, (x, y) -> x));

        List<Map<String, Object>> rows = repo.findSo(start, end);
        for (Map<String, Object> r : rows) {
            String empNo = str(r.get("bizrsptEmpnoCd"));
            String soCc = str(r.get("ccCd"));
            User u = empNo == null ? null : byEmpNo.get(empNo);
            // 담당자 소속 CC: ERP 사원정보(HR_EMPINFO_DTL)가 1순위, 없으면 CRM 사용자(동기화 값) — CRM 에 없는 사원(이메일 없음 등)도 판정되게.
            String erpCc = str(r.get("erpEmpCcCd"));
            String userCc = u == null ? null : str(u.getCcCd());
            String empCc = erpCc != null ? erpCc : userCc;
            String src = erpCc != null ? "ERP" : userCc != null ? "CRM" : null;
            r.put("empCcCd", empCc);
            r.put("empCcNm", erpCc != null ? r.get("erpEmpCcNm") : u == null ? null : u.getCcNm());
            r.put("empCcSrc", src);
            r.put("empDeptCd", u == null ? null : u.getDeptCd());
            r.put("empDeptNm", u == null || u.getDeptCd() == null ? null : deptNames.get(u.getDeptCd()));
            r.put("empUserId", u == null ? null : u.getId().getId());
            boolean knownEmp = u != null || r.get("bizrsptEmpnoNm") != null;
            // 라인마다 CC 가 다른 수주는 한 값으로 못 비교 — MIXED 로 따로 보여준다.
            boolean mixed = r.get("ccCnt") != null && ((Number) r.get("ccCnt")).intValue() > 1;
            String match = mixed ? "MIXED"
                    : empCc != null ? (Objects.equals(empCc, soCc) ? "MATCH" : "MISMATCH")
                    : knownEmp ? "NO_CC" : "NO_USER";
            r.put("ccMatch", match);
        }
        return rows;
    }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
