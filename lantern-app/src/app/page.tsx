export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <>
      <div className="topbar">
        <span className="wordmark">LANTERN</span>
      </div>
      <div className="centerwrap">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
          <h1 className="title" style={{ margin: 0, textAlign: 'center' }}>
            Lantern user study
          </h1>
          <a className="btn primary" href="/study">
            시작하기
          </a>
        </div>
      </div>
    </>
  );
}
