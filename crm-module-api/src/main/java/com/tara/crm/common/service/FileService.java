package com.tara.crm.common.service;

import com.tara.crm.common.entity.FileInfo;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.id.FileInfoId;
import com.tara.crm.common.repository.FileInfoRepository;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FileService {

    private final FileInfoRepository fileRepo;

    @Value("${file.upload-dir:./uploads}")
    private String uploadDir;

    private static final long MAX_SIZE = 500L * 1024 * 1024;

    @Transactional
    public FileInfo upload(MultipartFile file, String orderNo, Integer orderSq) throws IOException {
        return upload(file, orderNo, orderSq, null);
    }

    /** 주문 작업별 파일 업로드. category='THUMBNAIL'이면 P&D 발주서 시안으로 사용한다. */
    @Transactional
    public FileInfo upload(MultipartFile file, String orderNo, Integer orderSq, String category) throws IOException {
        return saveFile(file, "orders",
                b -> b.orderNo(orderNo).orderSq(orderSq).fileCategory(category));
    }

    /** 시트 #5 0513 — 외주발주서(PoMst) 첨부파일 업로드. */
    @Transactional
    public FileInfo uploadForPo(MultipartFile file, String poNo) throws IOException {
        return uploadForPo(file, poNo, null);
    }

    /** 외주발주서 첨부 업로드. category='THUMBNAIL' 이면 패키지 발주서 PDF 하단 썸네일용. */
    @Transactional
    public FileInfo uploadForPo(MultipartFile file, String poNo, String category) throws IOException {
        return saveFile(file, "po", b -> b.poNo(poNo).fileCategory(category));
    }

    /** 비대면결제 안내메일 첨부용 업로드 — 1건, 10MB 이하, pdf/xls/xlsx 만 허용(백엔드 방어검증). */
    @Transactional
    public FileInfo uploadForUntact(MultipartFile file, String untactNo) throws IOException {
        validateUntactAttachment(file);
        return saveFile(file, "untact", b -> b.untactNo(untactNo));
    }

    /** 공지사항(notices.id) 첨부 업로드 — 최대 500MB. 권한(ADMIN/지정부서) 체크는 NoticeService 에서. */
    @Transactional
    public FileInfo uploadForNotice(MultipartFile file, Long noticeId) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "첨부파일이 비어 있습니다.");
        }
        return saveFile(file, "notice", b -> b.noticeId(noticeId));
    }

    /** 공지사항 첨부 목록. */
    @Transactional(readOnly = true)
    public java.util.List<FileInfo> listByNotice(Integer companyCd, Integer plantCd, Long noticeId) {
        return fileRepo.findByNoticeId(companyCd, plantCd, noticeId);
    }

    /** 사내실적 매출(sales_mst.sales_no) 첨부 업로드 — 최대 500MB. */
    @Transactional
    public FileInfo uploadForSales(MultipartFile file, String salesNo) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "첨부파일이 비어 있습니다.");
        }
        return saveFile(file, "sales", b -> b.salesNo(salesNo));
    }

    /** 사내실적 매출 첨부 목록. */
    @Transactional(readOnly = true)
    public java.util.List<FileInfo> listBySales(Integer companyCd, Integer plantCd, String salesNo) {
        return fileRepo.findBySalesNo(companyCd, plantCd, salesNo);
    }

    /** 매출목록 아이콘 색상용 — 첨부파일이 있는 salesNo 집합(배치). */
    @Transactional(readOnly = true)
    public java.util.Set<String> salesNosWithFiles(Integer companyCd, java.util.List<String> salesNos) {
        if (salesNos == null || salesNos.isEmpty()) return java.util.Set.of();
        return new java.util.HashSet<>(fileRepo.findSalesNosWithFiles(companyCd, salesNos));
    }

    private static final long UNTACT_ATTACH_MAX = 10L * 1024 * 1024;  // 10MB
    private static final java.util.Set<String> UNTACT_ATTACH_EXTS = java.util.Set.of("pdf", "xls", "xlsx", "xlsm");
    private void validateUntactAttachment(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "첨부파일이 비어 있습니다.");
        }
        if (file.getSize() > UNTACT_ATTACH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "첨부파일은 10MB 이하만 가능합니다.");
        }
        String name = file.getOriginalFilename();
        int dot = name != null ? name.lastIndexOf('.') : -1;
        String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase(java.util.Locale.ROOT) : "";
        if (!UNTACT_ATTACH_EXTS.contains(ext)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "엑셀/PDF 파일만 첨부 가능합니다.");
        }
    }

    private FileInfo saveFile(MultipartFile file, String subdir,
                               java.util.function.Function<FileInfo.FileInfoBuilder, FileInfo.FileInfoBuilder> apply) throws IOException {
        if (file.getSize() > MAX_SIZE) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "파일 크기가 500MB를 초과합니다.");
        }
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        if (companyCd == null) companyCd = 1000;
        Integer plantCd = 2000;

        String fileId = UUID.randomUUID().toString();
        // 원본 파일명에서 경로 성분(/, \)을 제거해 basename 만 사용 — '../../' 등 경로 이탈(디렉터리 밖 쓰기) 차단.
        String raw = file.getOriginalFilename();
        String safeName = (raw == null) ? "file" : raw.replaceAll("^.*[/\\\\]", "");
        if (safeName.isBlank()) safeName = "file";
        String storedName = fileId + "_" + safeName;
        Path dir = Paths.get(uploadDir, subdir).normalize();
        Files.createDirectories(dir);
        Path target = dir.resolve(storedName).normalize();
        // 방어적 확인 — 정규화 후에도 업로드 디렉터리 밖이면 거부.
        if (!target.startsWith(dir)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "잘못된 파일명입니다.");
        }
        Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);

        FileInfo.FileInfoBuilder builder = FileInfo.builder()
            .id(new FileInfoId(companyCd, plantCd, fileId))
            .originalName(file.getOriginalFilename())
            .storedName(storedName)
            .filePath(target.toString())
            .fileSize(file.getSize())
            .contentType(file.getContentType());
        return fileRepo.save(apply.apply(builder).build());
    }

    @Transactional(readOnly = true)
    public java.util.List<FileInfo> listByOrderWork(Integer companyCd, Integer plantCd, String orderNo, Integer orderSq) {
        // THUMBNAIL 은 P&D 발주서 시안 전용 — 일반 첨부파일 목록에는 노출하지 않는다(첨부/썸네일 분리).
        return fileRepo.findByOrderDtl(companyCd, plantCd, orderNo, orderSq).stream()
                .filter(f -> !"THUMBNAIL".equals(f.getFileCategory()))
                .toList();
    }

    @Transactional(readOnly = true)
    public FileInfo getInfo(Integer companyCd, Integer plantCd, String fileId) {
        return fileRepo.findById(new FileInfoId(companyCd, plantCd, fileId))
            .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "File not found."));
    }

    @Transactional(readOnly = true)
    public Resource download(Integer companyCd, Integer plantCd, String fileId) throws IOException {
        FileInfo f = fileRepo.findById(new FileInfoId(companyCd, plantCd, fileId))
            .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "파일을 찾을 수 없습니다."));
        return new UrlResource(Paths.get(f.getFilePath()).toUri());
    }

    @Transactional
    public void delete(Integer companyCd, Integer plantCd, String fileId) throws IOException {
        FileInfo f = fileRepo.findById(new FileInfoId(companyCd, plantCd, fileId))
            .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "파일을 찾을 수 없습니다."));
        Files.deleteIfExists(Paths.get(f.getFilePath()));
        fileRepo.delete(f);
    }
}
