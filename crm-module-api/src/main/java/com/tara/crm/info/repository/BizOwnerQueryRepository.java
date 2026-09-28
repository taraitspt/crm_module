package com.tara.crm.info.repository;

import com.querydsl.core.BooleanBuilder;
import com.querydsl.core.types.Projections;
import com.querydsl.jpa.impl.JPAQueryFactory;
import com.tara.crm.auth.entity.QDepartment;
import com.tara.crm.info.dto.BizOwnerDto;
import com.tara.crm.info.entity.QBusinessOwner;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Repository;
import org.springframework.util.StringUtils;

import java.util.List;

@Repository
@RequiredArgsConstructor
public class BizOwnerQueryRepository {

    private final JPAQueryFactory queryFactory;

    public Page<BizOwnerDto.ListItem> search(BizOwnerDto.SearchCondition cond,
                                              Pageable pageable, Integer companyCd) {
        QBusinessOwner biz = QBusinessOwner.businessOwner;
        QDepartment dept = QDepartment.department;

        BooleanBuilder where = buildWhere(biz, cond, companyCd);

        // 시트 R411 — 등록일/수정일 노출. 최근 주문일은 service 후처리에서 채움.
        List<BizOwnerDto.ListItem> content = queryFactory
            .select(Projections.bean(BizOwnerDto.ListItem.class,
                biz.id,
                biz.partnerCd,
                biz.companyName,
                biz.bizNo,
                biz.bizType,
                biz.bizItem,
                biz.address,
                biz.deptCd,
                dept.deptNm.as("departmentName"),
                biz.createdAt,
                biz.updatedAt
            ))
            .from(biz)
            .leftJoin(dept).on(
                dept.id.companyCd.eq(biz.companyCd)
                .and(dept.id.deptCd.eq(biz.deptCd))
            )
            .where(where)
            .orderBy(biz.companyName.asc())
            .offset(pageable.getOffset())
            .limit(pageable.getPageSize())
            .fetch();

        Long totalLong = queryFactory
            .select(biz.count())
            .from(biz)
            .where(where)
            .fetchOne();
        long total = totalLong != null ? totalLong : 0L;

        return new PageImpl<>(content, pageable, total);
    }

    private BooleanBuilder buildWhere(QBusinessOwner biz, BizOwnerDto.SearchCondition cond, Integer companyCd) {
        BooleanBuilder where = new BooleanBuilder();
        where.and(biz.companyCd.eq(companyCd));

        if (cond.getDeptCd() != null) {
            where.and(biz.deptCd.eq(cond.getDeptCd()));
        }
        if (StringUtils.hasText(cond.getKeyword())) {
            String kw = "%" + cond.getKeyword() + "%";
            where.and(biz.companyName.like(kw));
        }
        return where;
    }
}
