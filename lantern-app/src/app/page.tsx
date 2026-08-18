export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <>
      <div className="topbar">
        <span className="wordmark">LANTERN</span>
      </div>
      <div className="centerwrap">
        <div className="card">
          <div className="eyebrow">FORMATIVE STUDY · 프로토타입</div>
          <h1 className="title">
            AI가 내 대화에서 무엇을 알아낼 수 있는지 확인하고, 정책이나 문장을 직접 고쳐 보면서
            그 대가가 무엇인지 살펴보는 공간입니다.
          </h1>
          <div className="footerbar">
            <a className="btn primary" href="/study">
              시작하기
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
