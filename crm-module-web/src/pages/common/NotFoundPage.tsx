import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

/**
 * 404 페이지. 오타 URL·구 북마크·미등록 경로 진입 시 React Router 의
 * 개발자용 ErrorBoundary 대신 사용자 친화적인 안내를 노출한다.
 * routes/index.tsx 의 catch-all (`path: '*'`) 에 연결.
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="404"
      subTitle="요청하신 페이지를 찾을 수 없습니다."
      extra={
        <Button type="primary" onClick={() => navigate('/', { replace: true })}>
          홈으로 이동
        </Button>
      }
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
    />
  );
}
