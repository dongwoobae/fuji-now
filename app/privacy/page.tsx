import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보처리방침 | FUJI NOW" };

export default function PrivacyPage() {
  return (
    <main className="prose">
      <h1>개인정보처리방침</h1>

      <h2>수집하는 정보</h2>
      <p>FUJI NOW는 방문자의 개인정보를 수집하거나 저장하지 않습니다. 회원가입, 방문 분석 도구가 없습니다.</p>
      <p>
        실측 기록 페이지(/report)는 운영자 전용입니다. 운영자가 입력한 코드를 확인하는 쿠키 하나를 그 페이지에서만 씁니다.
        저장하는 내용은 장소, 시각, 후지산이 보인 정도, 메모뿐이며 입력한 사람의 정보는 저장하지 않습니다.
      </p>

      <h2>제3자 서비스</h2>
      <ul>
        <li>
          카메라 영상은 YouTube 임베드 플레이어로 재생합니다. 재생 버튼을 누르기 전에는 YouTube에 연결하지 않습니다. 누른 뒤에는
          YouTube(Google)가 자체 정책에 따라 쿠키와 시청 정보를 처리할 수 있습니다. 플레이어는 개인정보 보호 강화 모드
          (youtube-nocookie.com)로 불러옵니다.
        </li>
        <li>사이트는 Cloudflare Workers에서 운영합니다. Cloudflare는 요청을 처리하는 과정에서 IP 주소 등 접속 정보를 다룹니다.</li>
        <li>기상 예보 기록과 실측 기록은 Neon(PostgreSQL, 싱가포르 리전)에 저장합니다. 방문자 정보는 들어가지 않습니다.</li>
      </ul>

      <h2>YouTube API Services</h2>
      <p>
        이 사이트는 카메라가 지금 방송 중인지 확인하려고 YouTube API Services를 사용합니다. 서버가 공개 영상의 방송 상태만
        조회하며, 방문자 정보는 보내지 않습니다. 자세한 내용은{" "}
        <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>과{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 서비스 약관</a>을
        참고하세요.
      </p>

      <h2>변경</h2>
      <p>방문 분석 도구처럼 정보를 처리하는 기능을 추가하면 이 문서를 먼저 고칩니다.</p>
    </main>
  );
}
