import apiClient from './client';

/**
 * 파일 → PDF 변환. 응답이 PDF 바이너리라 responseType 을 blob 으로 둔다.
 * 실패 시에도 blob 이 내려오므로 호출부에서 JSON 으로 파싱해 메시지를 꺼낸다.
 */
export const convertFileToPdf = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post<Blob>('/tools/pdf-converter/convert', formData, {
    responseType: 'blob',
    headers: { 'Content-Type': 'multipart/form-data' },
    // LibreOffice 변환은 문서가 크면 수십 초 걸린다. 기본 타임아웃보다 넉넉히.
    timeout: 3 * 60 * 1000,
  });
};
