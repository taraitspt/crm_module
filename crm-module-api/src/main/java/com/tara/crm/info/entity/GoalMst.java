package com.tara.crm.info.entity;

import com.tara.crm.common.audit.BaseEntity;
import com.tara.crm.common.id.GoalMstId;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "goal_mst")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class GoalMst extends BaseEntity {

    @EmbeddedId
    private GoalMstId id;

    @Column(name = "goal_amt")
    private Long goalAmt;

    @Column(name = "inner_amt")
    private Long innerAmt;

    @Column(name = "outer_amt")
    private Long outerAmt;

    @Column(name = "actual_amt")
    private Long actualAmt;

    @Column(name = "note", length = 500)
    private String note;
}
