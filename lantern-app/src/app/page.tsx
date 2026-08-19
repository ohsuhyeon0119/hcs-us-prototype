'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'start' | 'resume'>('start');
  const [id, setId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = () => {
    const pid = `P${Date.now().toString(36).slice(-6).toUpperCase()}`;
    sessionStorage.setItem('lantern.participant', pid);
    router.push('/study');
  };

  const resume = async () => {
    const pid = id.trim().toUpperCase();
    if (!pid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/resume?participantId=${encodeURIComponent(pid)}`);
      const d = await r.json();
      if (!d.found) {
        setError('해당 참가자 ID의 기록을 찾을 수 없습니다.');
        return;
      }
      if (d.completed) {
        setError('이미 완료된 세션입니다.');
        return;
      }
      sessionStorage.setItem('lantern.participant', pid);
      router.push('/study');
    } catch {
      setError('기록을 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

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

          {mode === 'start' ? (
            <>
              <button className="btn primary" onClick={start}>시작하기</button>
              <button className="linkbtn" onClick={() => { setMode('resume'); setError(null); }}>
                이전에 하던 세션 이어서 하기
              </button>
            </>
          ) : (
            <div className="resumebox">
              <div className="section" style={{ marginBottom: 10 }}>참가자 ID</div>
              <input
                className="tf mono"
                value={id}
                onChange={(e) => setId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && resume()}
                placeholder="P1A2B3"
                autoFocus
              />
              {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn ghost" onClick={() => { setMode('start'); setId(''); setError(null); }}>
                  뒤로
                </button>
                <button className="btn primary" style={{ flex: 1 }} onClick={resume} disabled={busy || !id.trim()}>
                  {busy ? <span className="spin" /> : '이어서 하기'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
