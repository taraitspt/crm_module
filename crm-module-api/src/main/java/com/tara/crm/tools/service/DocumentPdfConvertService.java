package com.tara.crm.tools.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.PrintSetup;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentPdfConvertService {

    private static final long MAX_FILE_SIZE = 50L * 1024 * 1024;
    private static final Set<String> IMAGE_EXTENSIONS = Set.of("jpg", "jpeg", "png", "bmp", "gif");
    private static final Set<String> OFFICE_EXTENSIONS = Set.of("xls", "xlsx", "doc", "docx");

    @Value("${document.pdf-converter.libreoffice-command:soffice}")
    private String libreOfficeCommand;

    @Value("${document.pdf-converter.timeout-seconds:120}")
    private long timeoutSeconds;

    public ConvertedPdf convert(MultipartFile file) {
        validate(file);
        String originalName = StringUtils.hasText(file.getOriginalFilename())
                ? Path.of(file.getOriginalFilename()).getFileName().toString()
                : "converted";
        String extension = extensionOf(originalName);
        byte[] pdf = IMAGE_EXTENSIONS.contains(extension)
                ? convertImage(file)
                : convertOfficeDocument(file, originalName);
        return new ConvertedPdf(pdf, baseName(originalName) + ".pdf");
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "변환할 파일을 선택해주세요.");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "파일은 50MB 이하만 변환할 수 있습니다.");
        }
        String extension = extensionOf(file.getOriginalFilename());
        if (!IMAGE_EXTENSIONS.contains(extension) && !OFFICE_EXTENSIONS.contains(extension)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "지원 형식은 JPG, JPEG, PNG, BMP, GIF, XLS, XLSX, DOC, DOCX입니다.");
        }
    }

    private byte[] convertImage(MultipartFile file) {
        try {
            BufferedImage image = ImageIO.read(file.getInputStream());
            if (image == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지 파일을 읽을 수 없습니다.");
            }
            boolean landscape = image.getWidth() > image.getHeight();
            PDRectangle pageSize = landscape ? new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth()) : PDRectangle.A4;
            try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                PDPage page = new PDPage(pageSize);
                document.addPage(page);
                PDImageXObject pdfImage = LosslessFactory.createFromImage(document, image);
                float margin = 24f;
                float availableWidth = pageSize.getWidth() - margin * 2;
                float availableHeight = pageSize.getHeight() - margin * 2;
                float scale = Math.min(availableWidth / image.getWidth(), availableHeight / image.getHeight());
                float width = image.getWidth() * scale;
                float height = image.getHeight() * scale;
                float x = (pageSize.getWidth() - width) / 2;
                float y = (pageSize.getHeight() - height) / 2;
                try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                    stream.drawImage(pdfImage, x, y, width, height);
                }
                document.save(output);
                return output.toByteArray();
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이미지 PDF 변환에 실패했습니다.", e);
        }
    }

    private byte[] convertOfficeDocument(MultipartFile file, String originalName) {
        Path tempDir = null;
        try {
            tempDir = Files.createTempDirectory("sm-pdf-convert-");
            Path input = tempDir.resolve(originalName);
            Path profileDir = tempDir.resolve("libreoffice-profile");
            Path processOutput = tempDir.resolve("libreoffice-output.log");
            Files.createDirectories(profileDir);
            file.transferTo(input);

            String extension = extensionOf(originalName);
            if ("xls".equals(extension) || "xlsx".equals(extension)) {
                // 인쇄설정 보정은 "가로 한 장에 열을 다 담기" 위한 부가 단계다.
                // POI 가 못 읽는 엑셀(타 도구가 만든 변형 xlsx 등)이라도 LibreOffice 는 변환할 수 있으므로,
                // 여기서 실패해도 변환 자체를 중단하지 않는다.
                try {
                    applyExcelPrintSettings(input);
                } catch (Exception e) {
                    log.warn("엑셀 인쇄설정 보정 실패 — 원본 설정 그대로 변환합니다: {}", e.toString());
                }
            }

            Process process = new ProcessBuilder(
                    libreOfficeCommand,
                    "--headless", "--nologo", "--nofirststartwizard",
                    "-env:UserInstallation=" + profileDir.toUri(),
                    "--convert-to", "pdf", "--outdir", tempDir.toString(), input.toString())
                    .redirectErrorStream(true)
                    .redirectOutput(processOutput.toFile())
                    .start();
            boolean finished = process.waitFor(Duration.ofSeconds(timeoutSeconds).toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new ResponseStatusException(HttpStatus.REQUEST_TIMEOUT, "문서 PDF 변환 시간이 초과되었습니다.");
            }
            String output = Files.exists(processOutput) ? Files.readString(processOutput) : "";
            Path pdf = tempDir.resolve(baseName(originalName) + ".pdf");
            if (process.exitValue() != 0 || !Files.exists(pdf)) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "문서 PDF 변환에 실패했습니다. LibreOffice 설치 및 문서 상태를 확인해주세요. " + output.trim());
            }
            return Files.readAllBytes(pdf);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (IOException e) {
            // 로컬 개발 PC 처럼 LibreOffice 가 없으면 프로세스 시작 자체가 실패한다.
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "서버에 LibreOffice가 설치되어 있지 않아 엑셀·워드 변환을 할 수 없습니다."
                    + " (이미지 → PDF 변환은 설치 없이 동작합니다)", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "문서 PDF 변환이 중단되었습니다.", e);
        } finally {
            deleteDirectory(tempDir);
        }
    }

    /**
     * Keep all columns of an Excel sheet on the same PDF page width while
     * allowing rows to continue onto subsequent pages.
     */
    private void applyExcelPrintSettings(Path input) throws IOException {
        try (Workbook workbook = WorkbookFactory.create(input.toFile())) {
            for (Sheet sheet : workbook) {
                PrintSetup printSetup = sheet.getPrintSetup();
                printSetup.setLandscape(true);
                printSetup.setPaperSize(PrintSetup.A4_PAPERSIZE);
                printSetup.setFitWidth((short) 1);
                printSetup.setFitHeight((short) 0);
                sheet.setFitToPage(true);
                sheet.setAutobreaks(true);
            }
            try (var output = Files.newOutputStream(input)) {
                workbook.write(output);
            }
        }
    }

    private void deleteDirectory(Path directory) {
        if (directory == null || !Files.exists(directory)) return;
        try (var paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try { Files.deleteIfExists(path); } catch (IOException ignored) { }
            });
        } catch (IOException ignored) { }
    }

    private String extensionOf(String filename) {
        if (!StringUtils.hasText(filename) || !filename.contains(".")) return "";
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    }

    private String baseName(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.substring(0, dot) : filename;
    }

    public record ConvertedPdf(byte[] bytes, String filename) { }
}
