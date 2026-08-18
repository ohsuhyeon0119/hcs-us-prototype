import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="topbar">
        <Link className="wordmark" href="/">LANTERN</Link>
        <nav style={{ display: 'flex', gap: 6, marginLeft: 28 }}>
          <Link className="navlink" href="/admin/scenarios">Scenarios</Link>
          <Link className="navlink" href="/admin/sessions">Sessions</Link>
        </nav>
        <div className="spacer" />
        <span className="note">Admin</span>
      </div>
      {children}
    </>
  );
}
