package com.tara.crm.notice.repository;

import com.tara.crm.notice.entity.Notice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface NoticeRepository extends JpaRepository<Notice, Long> {

    /** 목록 — 상단 고정 먼저, 그다음 최신순. */
    List<Notice> findAllByOrderByPinnedDescNoticeIdDesc();

    /** 오늘 팝업으로 띄울 공지 — 팝업 사용이고 기간(양끝 포함) 안. 최신순. */
    @Query("SELECT n FROM Notice n WHERE n.popupYn = true AND n.popupStart <= :today AND n.popupEnd >= :today ORDER BY n.noticeId DESC")
    List<Notice> findPopups(@Param("today") LocalDate today);
}
