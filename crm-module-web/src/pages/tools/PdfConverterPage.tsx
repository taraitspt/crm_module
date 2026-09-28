import { useState } from 'react';
import { Button, Card, Space, Typography, Upload, message } from 'antd';
import { FilePdfOutlined, InboxOutlined, SwapOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { PageLayout } from '@/components/layout';
import { convertFileToPdf } from '@/api/tools.api';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

const PdfConverterPage = () => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [converting, setConverting] = useState(false);

  const uploadProps: UploadProps = {
    accept: '.jpg,.jpeg,.png,.bmp,.gif,.xls,.xlsx,.doc,.docx',
    maxCount: 1,
    multiple: false,
    fileList,
    beforeUpload: () => false,
    onChange: ({ fileList: next }) => setFileList(next.slice(-1)),
    onRemove: () => {
      setFileList([]);
      return true;
    },
  };

  const handleConvert = async () => {
    const originFile = fileList[0]?.originFileObj;
    if (!originFile) {
      message.warning('변환할 파일을 선택해주세요.');
      return;
    }
    setConverting(true);
    try {
      const response = await convertFileToPdf(originFile as File);
      const filename = originFile.name.replace(/\.[^.]+$/, '') + '.pdf';
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      message.success('PDF 변환이 완료되었습니다.');
    } catch (error: unknown) {
      let detail = 'PDF 변환에 실패했습니다.';
      const data = (error as { response?: { data?: unknown } })?.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          detail = parsed?.message || parsed?.detail || detail;
        } catch { /* 기본 오류 문구 사용 */ }
      }
      message.error(detail);
    } finally {
      setConverting(false);
    }
  };

  return (
    <PageLayout>
      <Space direction="vertical" size={20} style={{ width: '100%' }}>
        <div>
          <Title level={2} style={{ marginBottom: 4 }}>파일 PDF 변환</Title>
          <Text type="secondary">이미지, 엑셀 또는 워드 파일을 PDF로 변환하여 바로 다운로드합니다.</Text>
        </div>

        <Card style={{ maxWidth: 900 }}>
          <Dragger {...uploadProps} style={{ padding: '32px 20px' }}>
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">변환할 파일을 클릭하거나 이곳에 끌어놓으세요</p>
            <p className="ant-upload-hint">JPG, PNG, BMP, GIF, XLS, XLSX, DOC, DOCX · 최대 50MB · 한 번에 1개</p>
          </Dragger>

          <div style={{ marginTop: 20, padding: 16, borderRadius: 8, background: '#f7fafb' }}>
            <Paragraph style={{ marginBottom: 6 }}>
              <FilePdfOutlined style={{ marginRight: 8, color: '#0096a2' }} />
              이미지 비율에 맞춰 A4 세로 또는 가로 PDF로 변환합니다.
            </Paragraph>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              엑셀은 시트의 인쇄 설정을, 워드는 문서의 페이지 설정을 기준으로 변환하므로 원본 설정에 따라 결과가 달라질 수 있습니다.
            </Paragraph>
          </div>

          <div style={{ marginTop: 20, textAlign: 'right' }}>
            <Button
              type="primary"
              size="large"
              icon={<SwapOutlined />}
              disabled={fileList.length === 0}
              loading={converting}
              onClick={handleConvert}
            >
              PDF로 변환
            </Button>
          </div>
        </Card>
      </Space>
    </PageLayout>
  );
};

export default PdfConverterPage;
