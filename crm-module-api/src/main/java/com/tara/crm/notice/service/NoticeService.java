package com.tara.crm.notice.service;

import com.tara.crm.common.entity.FileInfo;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.repository.FileInfoRepository;
import com.tara.crm.common.service.FileService;
import com.tara.crm.common.util.SecurityContextUtil;
import com.tara.crm.notice.dto.NoticeDto;
import com.tara.crm.notice.entity.Notice;
import com.tara.crm.notice.repository.NoticeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 공지사항 — 읽기는 전원, 쓰기는 컨트롤러에서 ADMIN 으로 막는다.
 * 첨부파일은 공용 file_info(notice_id, file_category='NOTICE')에 둔다. 받을 땐 서명이 붙은 짧은 주소
 * (/api/public/notice-files/{fileId}?exp&sig)로 내려준다 — 모바일 앱(WebView)은 JWT 헤더를 붙여 파일을 받을 수 없어서,
 * 이 주소를 폰 브라우저로 넘겨 받게 한다(NoticeFiles.tsx).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NoticeService {

    private static final Set<String> CATEGORIES = Set.of("UPDATE", "NOTICE");
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    /** 첨부 한 건 최대 크기 — nginx client_max_body_size 100m 안쪽. */
    private static final long MAX_FILE = 95L * 1024 * 1024;
    /** 매뉴얼·안내문·화면 캡처·동영상 정도. 실행 파일·스크립트는 받지 않는다. */
    private static final Set<String> EXTS = Set.of(
            "pdf", "doc", "docx", "xls", "xlsx", "xlsm", "ppt", "pptx", "hwp", "hwpx", "txt", "csv",
            "zip", "png", "jpg", "jpeg", "gif", "mp4");
    /** 다운로드 주소 유효 시간. */
    private static final long LINK_TTL_SEC = 5 * 60;

    private final NoticeRepository repository;
    private final FileInfoRepository fileRepo;
    private final FileService fileService;

    @Value("${jwt.secret}")
    private String secret;

    public List<NoticeDto.Item> list() {
        return withFiles(repository.findAllByOrderByPinnedDescNoticeIdDesc());
    }

    public NoticeDto.Item get(Long id) {
        return withFiles(List.of(find(id))).get(0);
    }

    /** 오늘(서울) 팝업 기간에 걸린 공지. */
    public List<NoticeDto.Item> popups() {
        return withFiles(repository.findPopups(LocalDate.now(SEOUL)));
    }

    @Transactional
    public NoticeDto.Item create(NoticeDto.SaveRequest req) {
        Notice n = new Notice();
        n.setAuthorName(SecurityContextUtil.getCurrentUserName());
        apply(n, req);
        return withFiles(List.of(repository.save(n))).get(0);
    }

    @Transactional
    public NoticeDto.Item update(Long id, NoticeDto.SaveRequest req) {
        Notice n = find(id);
        apply(n, req);
        return withFiles(List.of(n)).get(0);
    }

    @Transactional
    public void delete(Long id) throws IOException {
        Notice n = find(id);
        for (FileInfo f : fileRepo.findNoticeFiles(List.of(id))) removeFile(f);
        repository.delete(n);
    }

    // ── 첨부파일 ──

    @Transactional
    public NoticeDto.FileItem addFile(Long id, MultipartFile file) throws IOException {
        find(id);
        if (file == null || file.isEmpty()) throw new BusinessException(ErrorCode.INVALID_INPUT, "첨부파일이 비어 있습니다.");
        if (file.getSize() > MAX_FILE) throw new BusinessException(ErrorCode.INVALID_INPUT, "첨부파일은 한 건에 95MB 까지 올릴 수 있습니다.");
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        if (!EXTS.contains(ext)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "올릴 수 없는 파일 형식입니다(" + (ext.isEmpty() ? "확장자 없음" : ext) + ").");
        }
        return NoticeDto.FileItem.of(fileService.uploadForNotice(file, id));
    }

    @Transactional
    public void deleteFile(Long id, String fileId) throws IOException {
        removeFile(noticeFile(id, fileId));
    }

    /** 몇 분짜리 서명 다운로드 주소(경로만). */
    public NoticeDto.FileLink fileLink(Long id, String fileId) {
        noticeFile(id, fileId);
        long exp = System.currentTimeMillis() / 1000 + LINK_TTL_SEC;
        return new NoticeDto.FileLink("/api/public/notice-files/" + fileId + "?exp=" + exp + "&sig=" + sign(fileId, exp));
    }

    /** 공개 다운로드 — 서명·만료를 확인한 뒤 공지 첨부만 내준다. */
    public FileInfo verifiedFile(String fileId, long exp, String sig) {
        boolean ok = exp >= System.currentTimeMillis() / 1000 && sig != null
                && MessageDigest.isEqual(sign(fileId, exp).getBytes(StandardCharsets.UTF_8), sig.getBytes(StandardCharsets.UTF_8));
        if (!ok) throw new BusinessException(ErrorCode.ACCESS_DENIED, "다운로드 주소가 만료됐거나 올바르지 않습니다. 화면에서 다시 눌러 주세요.");
        FileInfo f = fileRepo.findByFileId(fileId).orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (f.getNoticeId() == null || !"NOTICE".equals(f.getFileCategory())) throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        return f;
    }

    public Resource resource(FileInfo f) throws IOException {
        return new UrlResource(Paths.get(f.getFilePath()).toUri());
    }

    private FileInfo noticeFile(Long id, String fileId) {
        FileInfo f = fileRepo.findByFileId(fileId).orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
        if (!id.equals(f.getNoticeId()) || !"NOTICE".equals(f.getFileCategory())) throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND);
        return f;
    }

    private void removeFile(FileInfo f) throws IOException {
        Files.deleteIfExists(Paths.get(f.getFilePath()));
        fileRepo.delete(f);
    }

    private String sign(String fileId, long exp) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(("notice-file:" + secret).getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] h = mac.doFinal((fileId + ":" + exp).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(h);
        } catch (Exception e) {
            throw new IllegalStateException("서명 실패", e);
        }
    }

    private List<NoticeDto.Item> withFiles(List<Notice> notices) {
        if (notices.isEmpty()) return List.of();
        Collection<Long> ids = notices.stream().map(Notice::getNoticeId).toList();
        Map<Long, List<NoticeDto.FileItem>> files = fileRepo.findNoticeFiles(ids).stream()
                .collect(Collectors.groupingBy(FileInfo::getNoticeId, Collectors.mapping(NoticeDto.FileItem::of, Collectors.toList())));
        return notices.stream().map(n -> NoticeDto.Item.of(n, files.getOrDefault(n.getNoticeId(), List.of()))).toList();
    }

    private Notice find(Long id) {
        return repository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    private static void apply(Notice n, NoticeDto.SaveRequest req) {
        String cat = req.getCategory() == null ? "NOTICE" : req.getCategory().trim().toUpperCase();
        if (!CATEGORIES.contains(cat)) throw new BusinessException(ErrorCode.INVALID_INPUT, "분류는 업데이트/공지 중 하나입니다.");
        if (req.isPopupYn()) {
            if (req.getPopupStart() == null || req.getPopupEnd() == null)
                throw new BusinessException(ErrorCode.INVALID_INPUT, "팝업 기간(시작일·종료일)을 입력해 주세요.");
            if (req.getPopupEnd().isBefore(req.getPopupStart()))
                throw new BusinessException(ErrorCode.INVALID_INPUT, "팝업 종료일이 시작일보다 빠릅니다.");
        }
        n.setCategory(cat);
        n.setTitle(req.getTitle().trim());
        n.setContent(req.getContent());
        n.setPinned(req.isPinned());
        n.setPopupYn(req.isPopupYn());
        n.setPopupStart(req.isPopupYn() ? req.getPopupStart() : null);
        n.setPopupEnd(req.isPopupYn() ? req.getPopupEnd() : null);
    }
}
