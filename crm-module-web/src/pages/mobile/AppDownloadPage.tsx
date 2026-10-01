import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'antd';
import { AndroidOutlined, AppleOutlined, DownloadOutlined, GlobalOutlined } from '@ant-design/icons';
import Logo from '@/components/common/Logo';
import { T } from '@/theme/designTokens';

/** APK 는 빌드 스크립트(npm run app:android)가 public/downloads/ 에 복사한다. 서버 배포본에도 같이 올라간다. */
export const APK_PATH = '/downloads/tara-crm.apk';

const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

function Card({ title, icon, highlight, children }: { title: string; icon: React.ReactNode; highlight?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${highlight ? T.primary : T.border1}`, borderRadius: 14, padding: 18,
      boxShadow: highlight ? '0 0 0 3px rgba(0,150,162,0.12)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 22, color: T.primary700 }}>{icon}</span>
        <span style={{ fontSize: 17, fontWeight: 700, color: T.t1 }}>{title}</span>
        {highlight && <span style={{ marginLeft: 'auto', fontSize: 11, color: T.primary700, background: T.primary50, border: `1px solid ${T.primary100}`, borderRadius: 10, padding: '2px 8px' }}>내 기기</span>}
      </div>
      {children}
    </div>
  );
}

const Steps = ({ items }: { items: React.ReactNode[] }) => (
  <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 14, color: T.t2, lineHeight: 1.8 }}>
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ol>
);

/**
 * 앱 설치 안내 — 로그인 없이 열리는 공개 페이지(/app). 링크 하나로 배포한다.
 * 안드로이드는 APK 다운로드, 아이폰은 홈 화면 추가(App Store 등록 전까지), 둘 다 싫으면 브라우저로.
 */
const AppDownloadPage: React.FC = () => (
  <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.font, padding: '28px 16px 40px' }}>
    <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ display: 'inline-block' }}><Logo size={30} /></div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.t1, margin: '14px 0 4px' }}>TARA 영업관리 앱 설치</h1>
        <div style={{ fontSize: 13, color: T.t3 }}>영업활동 · 거래처 카드 · 관리 필요 거래처 · 매출현황을 폰에서 씁니다.</div>
      </div>

      <Card title="안드로이드" icon={<AndroidOutlined />} highlight={isAndroid}>
        <Button type="primary" size="large" block icon={<DownloadOutlined />} href={APK_PATH} download="tara-crm.apk" style={{ height: 48, fontSize: 16, fontWeight: 700 }}>
          APK 다운로드
        </Button>
        <Steps items={[
          <>다운로드가 끝나면 알림에서 파일을 엽니다.</>,
          <>"출처를 알 수 없는 앱" 경고가 뜨면 <b>설정 → 이 출처 허용</b>을 켜고 돌아옵니다. (Play 스토어 앱이 아니라서 뜨는 안내입니다)</>,
          <><b>설치</b> → 홈 화면의 <b>TARA 영업관리</b> 아이콘으로 열어 ERP 아이디로 로그인합니다.</>,
        ]} />
        <div style={{ fontSize: 12, color: T.t3, marginTop: 10 }}>화면이 바뀌어도 앱을 다시 설치할 필요가 없습니다. 열 때마다 최신 화면을 가져옵니다.</div>
      </Card>

      <Card title="아이폰" icon={<AppleOutlined />} highlight={isIOS}>
        <div style={{ fontSize: 14, color: T.t2 }}>아이폰은 파일로 설치할 수 없어 <b>홈 화면에 추가</b>로 씁니다. 아이콘·전체 화면 모두 앱과 같습니다.</div>
        <Steps items={[
          <>이 페이지를 <b>Safari</b>로 엽니다. (카카오톡 안에서 열렸다면 오른쪽 아래 ⋮ → <b>Safari로 열기</b>)</>,
          <>아래 <b>앱 열기</b>를 누른 뒤, Safari 하단 가운데 <b>공유</b> 버튼(□↑)을 누릅니다.</>,
          <>목록에서 <b>홈 화면에 추가</b> → 오른쪽 위 <b>추가</b>.</>,
        ]} />
        <Button size="large" block icon={<GlobalOutlined />} style={{ marginTop: 12, height: 44 }}><Link to="/m">앱 열기</Link></Button>
        <div style={{ fontSize: 12, color: T.t3, marginTop: 10 }}>App Store 버전은 준비 중입니다. 등록되면 이 자리에 스토어 링크가 들어갑니다.</div>
      </Card>

      <div style={{ textAlign: 'center', fontSize: 13, color: T.t3, marginTop: 6 }}>
        설치하지 않고 쓰려면 <Link to="/m" style={{ color: T.primary700, fontWeight: 600 }}>브라우저에서 열기</Link> · PC는 <Link to="/" style={{ color: T.primary700, fontWeight: 600 }}>PC 화면</Link>
      </div>
    </div>
  </div>
);

export default AppDownloadPage;
