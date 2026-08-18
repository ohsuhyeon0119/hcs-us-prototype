export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <>
      <div className="topbar">
        <span className="wordmark">LANTERN</span>
      </div>
      <div className="centerwrap">
        <div className="card">
          <div className="eyebrow">FORMATIVE STUDY · STRAW-MAN PROTOTYPE</div>
          <h1 className="title">
            A sandbox where you inspect what an AI can infer, revise your policy or your words, and
            see what it costs.
          </h1>
          <div className="footerbar">
            <a className="btn primary" href="/study">
              Start a session
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
