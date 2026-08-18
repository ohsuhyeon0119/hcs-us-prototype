'use client';
import { useEffect, useState } from 'react';
import { ATTRIBUTES, attrLabel } from '@/lib/types';
import type { AttrKey, Scenario, Span, Turn } from '@/lib/types';

const BLANK = {
  id: '',
  title: '',
  recipient: '',
  purpose: '',
  aiTask: '',
  exposed: [] as AttrKey[],
  transcript: '',
  spans: [] as Span[],
};

function parseTranscript(src: string): Turn[] {
  const turns: Turn[] = [];
  let cur: Turn | null = null;
  for (const line of src.split('\n')) {
    const m = /^\s*(USER|AI|ASSISTANT)\s*:\s?(.*)$/i.exec(line);
    if (m) {
      if (cur) turns.push(cur);
      cur = { role: /^user$/i.test(m[1]) ? 'user' : 'assistant', text: m[2] };
    } else if (cur) {
      cur.text += '\n' + line;
    }
  }
  if (cur) turns.push(cur);
  return turns.map((t) => ({ ...t, text: t.text.trim() })).filter((t) => t.text);
}

const toTranscript = (turns: Turn[]) =>
  turns.map((t) => `${t.role === 'user' ? 'USER' : 'AI'}: ${t.text}`).join('\n');

export default function Admin() {
  const [list, setList] = useState<Scenario[]>([]);
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = async () => setList(await (await fetch('/api/scenarios')).json());
  useEffect(() => {
    void load();
  }, []);

  const turns = parseTranscript(form.transcript);

  const annotate = async () => {
    setBusy('annotate');
    setError('');
    try {
      const r = await fetch('/api/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setForm((f) => ({ ...f, spans: d.spans }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      const r = await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id || undefined,
          title: form.title,
          recipient: form.recipient,
          purpose: form.purpose,
          aiTask: form.aiTask,
          exposed: form.exposed,
          turns,
          spans: form.spans,
          annotatedAt: form.spans.length ? new Date().toISOString() : undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setForm({ ...BLANK });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const edit = (s: Scenario) =>
    setForm({
      id: s.id,
      title: s.title,
      recipient: s.recipient,
      purpose: s.purpose,
      aiTask: s.aiTask,
      exposed: s.exposed ?? [],
      transcript: toTranscript(s.turns),
      spans: s.spans ?? [],
    });

  const remove = async (id: string) => {
    if (!confirm('Delete this scenario?')) return;
    await fetch(`/api/scenarios/${id}`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="adminwrap">
        <div className="card wide" style={{ padding: 28 }}>
          <div className="eyebrow">REGISTERED SCENARIOS ({list.length})</div>
          {list.length === 0 ? (
            <p className="note">None yet. Register one below — participants run every scenario in this list, in order.</p>
          ) : (
            <table className="admin">
              <thead>
                <tr>
                  <th>Title</th><th>Recipient</th><th>Turns</th><th>Annotated spans</th><th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.title}</b>
                      <div style={{ marginTop: 4 }}>
                        {(s.exposed ?? []).map((e) => <span className="pill" key={e}>{attrLabel(e)}</span>)}
                      </div>
                    </td>
                    <td>{s.recipient}</td>
                    <td>{s.turns.length}</td>
                    <td>{s.spans?.length ?? 0}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost sm" onClick={() => edit(s)}>Edit</button>{' '}
                      <button className="btn danger sm" onClick={() => remove(s.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card wide" style={{ padding: 28 }}>
          <div className="eyebrow">{form.id ? `EDITING ${form.id}` : 'NEW SCENARIO'}</div>
          {error && <div className="err" style={{ marginBottom: 16 }}>{error}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Title (shown to the participant)" value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <div style={{ display: 'flex', gap: 16 }}>
              <Field label="Recipient" value={form.recipient} onChange={(v) => setForm({ ...form, recipient: v })} />
              <Field label="Purpose" value={form.purpose} onChange={(v) => setForm({ ...form, purpose: v })} />
            </div>
            <Field label="AI task (downstream task)" value={form.aiTask} onChange={(v) => setForm({ ...form, aiTask: v })} />

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Attributes this scenario is designed to expose</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ATTRIBUTES.map((a) => {
                  const on = form.exposed.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      className="btn ghost sm"
                      style={on ? { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' } : undefined}
                      onClick={() =>
                        setForm({
                          ...form,
                          exposed: on ? form.exposed.filter((k) => k !== a.key) : [...form.exposed, a.key],
                        })
                      }
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                Conversation — one turn per line, prefixed <code>USER:</code> or <code>AI:</code>
              </div>
              <textarea
                className="ta"
                style={{ minHeight: 260, fontFamily: 'var(--mono)', fontSize: 13 }}
                value={form.transcript}
                onChange={(e) => setForm({ ...form, transcript: e.target.value, spans: [] })}
                placeholder={'USER: Hey, I want to rethink how next quarter is laid out.\nAI: Happy to help. What would you like to change?'}
              />
              <div className="note">{turns.length} turns parsed.</div>
            </div>

            <div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                PII spans — what Block will mask
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <button className="btn ghost sm" onClick={annotate} disabled={!turns.length || busy === 'annotate'}>
                  {busy === 'annotate' ? <span className="spin" /> : 'Detect spans with the model'}
                </button>
                <span className="note">{form.spans.length} spans</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {form.spans.map((s, i) => (
                  <div key={i} className="hrow">
                    <span className="tag2">{attrLabel(s.attr)}</span>
                    <span className="e">
                      turn {s.turnIndex + 1} — “{s.text}”
                    </span>
                    <button
                      className="btn ghost sm"
                      style={{ padding: '2px 8px', fontSize: 11 }}
                      onClick={() => setForm({ ...form, spans: form.spans.filter((_, j) => j !== i) })}
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="footerbar">
            {form.id && (
              <button className="btn ghost" onClick={() => setForm({ ...BLANK })}>
                Cancel
              </button>
            )}
            <button
              className="btn primary"
              onClick={save}
              disabled={!form.title || !form.aiTask || !turns.length || busy === 'save'}
            >
              {busy === 'save' ? <span className="spin" /> : form.id ? 'Save changes' : 'Register scenario'}
            </button>
          </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <input className="tf" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
