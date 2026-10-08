package com.tara.crm.common.menu;

import com.tara.crm.common.util.DataScope;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 역할별 데이터 범위 조회·저장.
 *
 * 조회는 요청마다 여러 번 일어나므로(목록 한 번에 수천 행) 메모리에 들고 있다가
 * 저장할 때만 비운다. 테이블이 36행(리소스 4 × 역할 9)이라 전량 캐시가 부담되지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ResourceScopeService {

    private final ResourceScopeRepository repository;

    /** "RESOURCE|ROLE" → 범위. null 이면 아직 안 읽음. */
    private volatile Map<String, DataScope> cache;

    private Map<String, DataScope> cache() {
        Map<String, DataScope> c = cache;
        if (c == null) {
            c = new ConcurrentHashMap<>();
            for (ResourceScope s : repository.findAll()) {
                c.put(key(s.getId().getResource(), s.getId().getRole()), DataScope.parse(s.getScope()));
            }
            cache = c;
        }
        return c;
    }

    /** 이 역할이 이 리소스를 어디까지 보는가. 설정이 없으면 기본값으로 떨어진다. */
    public DataScope scopeOf(CrmResource resource, String role) {
        if (resource == null) return DataScope.SELF;
        if (role == null || role.isBlank()) return DataScope.SELF;
        DataScope s = cache().get(key(resource.name(), role));
        return s != null ? s : defaultScope(resource, role);
    }

    /** 한 역할의 전체 범위 — 로그인 응답과 사용자 관리 화면에서 보여준다. */
    public Map<String, String> scopesOf(String role) {
        Map<String, String> m = new LinkedHashMap<>();
        for (CrmResource r : CrmResource.values()) {
            m.put(r.name(), scopeOf(r, role).name());
        }
        return m;
    }

    /** 관리자 화면용 매트릭스 — 모든 리소스 × 모든 역할. */
    public ResourceScopeDto.Matrix matrix() {
        List<ResourceScopeDto.Row> rows = new ArrayList<>();
        for (CrmResource r : CrmResource.values()) {
            Map<String, String> roles = new LinkedHashMap<>();
            for (String role : MenuCatalog.ROLES) {
                roles.put(role, scopeOf(r, role).name());
            }
            rows.add(ResourceScopeDto.Row.builder()
                    .resource(r.name()).label(r.getLabel()).desc(r.getDesc())
                    .roles(roles).build());
        }
        return ResourceScopeDto.Matrix.builder()
                .roleOrder(MenuCatalog.ROLES).rows(rows).build();
    }

    @Transactional
    public void save(ResourceScopeDto.SaveRequest req) {
        if (req.getCells() == null || req.getCells().isEmpty()) return;
        for (ResourceScopeDto.Cell c : req.getCells()) {
            CrmResource resource;
            try {
                resource = CrmResource.valueOf(c.getResource());
            } catch (Exception e) {
                log.warn("[resource-scope] 알 수 없는 리소스 무시: {}", c.getResource());
                continue;
            }
            if (!MenuCatalog.ROLES.contains(c.getRole())) {
                log.warn("[resource-scope] 알 수 없는 역할 무시: {}", c.getRole());
                continue;
            }
            // 관리자에게서 전체 범위를 뺏으면 아무도 되돌릴 수 없다.
            DataScope scope = "ADMIN".equals(c.getRole()) ? DataScope.ALL : DataScope.parse(c.getScope());

            ResourceScope.Id id = new ResourceScope.Id(resource.name(), c.getRole());
            ResourceScope row = repository.findById(id).orElseGet(() -> {
                ResourceScope n = new ResourceScope();
                n.setId(id);
                return n;
            });
            row.setScope(scope.name());
            repository.save(row);
        }
        cache = null;
        log.info("[resource-scope] {}개 셀 저장", req.getCells().size());
    }

    /** resource_scope 에 행이 없을 때 쓰는 기본값 — V142 시드와 같은 규칙. */
    private static DataScope defaultScope(CrmResource resource, String role) {
        // 생산지원은 영업 데이터를 안 본다(V161) — 매출 통계 포함.
        if ("PROD_SPT".equals(role)) return DataScope.NONE;
        if (resource == CrmResource.SALES_STATS) return DataScope.ALL;
        return switch (role) {
            case "ADMIN", "SALES_SPT", "EXECUTIVE", "CENTER_LEADER", "FINANCE" -> DataScope.ALL;
            case "TEAM_LEADER", "PART_LEADER" -> DataScope.DEPT;
            default -> DataScope.SELF;
        };
    }

    private static String key(String resource, String role) {
        return resource + "|" + role;
    }
}
