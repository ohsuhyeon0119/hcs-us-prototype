export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <>
      <div className="topbar">
        <span className="wordmark">LANTERN</span>
      </div>
      <div className="centerwrap">
        <a className="btn primary" href="/study">
          시작하기
        </a>
      </div>
    </>
  );
}
