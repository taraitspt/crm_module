package com.tara.crm.entity;

import com.tara.crm.common.id.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 복합키 @Embeddable ID 클래스 equals/hashCode 테스트
 */
class EmbeddedIdTest {

    @Test
    @DisplayName("UserId - equals/hashCode 검증")
    void userId_equals() {
        UserId id1 = new UserId(1000, "admin");
        UserId id2 = new UserId(1000, "admin");

        assertEquals(id1, id2);
        assertEquals(id1.hashCode(), id2.hashCode());

        UserId id3 = new UserId(2000, "admin");
        assertNotEquals(id1, id3);
    }

    @Test
    @DisplayName("DepartmentId - equals/hashCode 검증")
    void departmentId_equals() {
        DepartmentId id1 = new DepartmentId(1000, 1100);
        DepartmentId id2 = new DepartmentId(1000, 1100);

        assertEquals(id1, id2);
        assertEquals(id1.hashCode(), id2.hashCode());
    }

    @Test
    @DisplayName("GoalMstId - 7필드 복합키 equals 검증")
    void goalMstId_equals() {
        GoalMstId id1 = new GoalMstId(1000, 1000, "2026", "03", "1100", "", "PART");
        GoalMstId id2 = new GoalMstId(1000, 1000, "2026", "03", "1100", "", "PART");
        GoalMstId id3 = new GoalMstId(1000, 1000, "2026", "03", "", "EMP001", "AM");

        assertEquals(id1, id2);
        assertNotEquals(id1, id3);
    }

    @Test
    @DisplayName("FileInfoId - equals 검증")
    void fileInfoId_equals() {
        FileInfoId id1 = new FileInfoId(1000, 1000, "FILE-UUID-001");
        FileInfoId id2 = new FileInfoId(1000, 1000, "FILE-UUID-001");

        assertEquals(id1, id2);
        assertEquals(id1.hashCode(), id2.hashCode());
    }
}
