import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        기상: 기상청 MSM 모델, <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> 제공
        (CC BY 4.0). 수치는 관측값이 아닌 예보 모델 값입니다.
      </p>
      <p>카메라 영상의 저작권은 각 채널에 있습니다. 이 사이트는 YouTube API Services를 사용합니다.</p>
      <p>
        이 사이트를 이용하면{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 서비스 약관</a>과{" "}
        <Link href="/privacy">개인정보처리방침</Link>에 동의한 것으로 봅니다.
      </p>
    </footer>
  );
}
