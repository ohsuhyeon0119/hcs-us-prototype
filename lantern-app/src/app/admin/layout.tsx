import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="topbar">
        <Link className="wordmark" href="/">LANTERN</Link>
        <nav style={{ display: 'flex', gap: 6, marginLeft: 28 }}>
          <Link className="navlink" href="/admin/sessions">세션</Link>
          <Link className="navlink" href="/admin/scenarios">시나리오</Link>
        </nav>
        <div className="spacer" />
        <span className="note">Admin</span>
      </div>
      {children}
    </>
  );
}
