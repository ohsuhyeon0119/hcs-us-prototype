'use client';
import type { Turn } from '@/lib/types';

/** The exchange that already happened. Read-only. */
export default function Transcript({ turns }: { turns: Turn[] }) {
  return (
    <div className="transcript">
      {turns.map((t, i) => (
        <div className={`turn ${t.role === 'user' ? 'u' : 'a'}`} key={i}>
          <div className={`bubble ${t.role === 'user' ? 'u' : 'a'}`}>{t.text}</div>
        </div>
      ))}
    </div>
  );
}
