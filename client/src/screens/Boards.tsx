import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type Classroom } from '../lib/api';
import type { DeviceRow } from '../lib/kiosk-source';

/**
 * Board management for one classroom.
 *
 * A board link is shown exactly once, at mint time — the server stores only a
 * hash and cannot produce it again. That is deliberate, and the UI says so
 * rather than letting a teacher discover it by coming back for the link later.
 */
export function BoardsView({ classroom }: { classroom: Classroom }) {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(180);
  const [freshToken, setFreshToken] = useState<{ label: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { devices: d } = await api.get<{ devices: DeviceRow[] }>(
        `/devices/classroom/${classroom.id}`,
      );
      setDevices(d);
    } catch (e: any) {
      setError(e.message);
    }
  }, [classroom.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setFreshToken(null); }, [classroom.id]);

  const mint = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const { token } = await api.post<{ token: string }>(`/devices/classroom/${classroom.id}`, {
        label: label.trim(), days,
      });
      setFreshToken({ label: label.trim(), url: `${window.location.origin}/board/link/${token}` });
      setLabel('');
      await load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const revoke = async (d: DeviceRow) => {
    if (!window.confirm(
      `Revoke "${d.label}"? That board stops working immediately and will need a new link.`,
    )) return;
    try {
      await api.del(`/devices/${d.id}`);
      setNotice(`"${d.label}" was revoked. It can no longer read this roster.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const status = (d: DeviceRow) => {
    if (d.revokedAt) return { text: 'Revoked', color: '#ffd6d6' };
    if (new Date(`${d.expiresAt}Z`) <= new Date()) return { text: 'Expired', color: '#ffe9c7' };
    return { text: `Active until ${d.expiresAt.slice(0, 10)}`, color: '#ccf5d8' };
  };

  return (
    <div className="stack">
      {error && <div className="alert">{error}</div>}
      {notice && <div className="alert alert--good">{notice}</div>}

      <div className="clay" style={{ padding: '1.6rem' }}>
        <h2 className="display" style={{ marginBottom: '0.3rem' }}>
          Boards for {classroom.name}
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          A linked board shows only this classroom's roster and records its check-ins.
          It carries no teacher sign-in, so leaving one on a wall overnight exposes
          nothing else in the school.
        </p>

        <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={mint}>
          <label className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
            <span>What is this board?</span>
            <input
              value={label} required maxLength={80}
              placeholder="Butterfly Room smartboard"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <label className="field" style={{ marginBottom: 0, maxWidth: 190 }}>
            <span>Link valid for</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>1 day</option>
              <option value={30}>30 days</option>
              <option value={180}>A school term (180 days)</option>
              <option value={365}>A school year (365 days)</option>
            </select>
          </label>
          <button className="clay-btn clay-btn--grass">Generate board link</button>
        </form>

        {freshToken && (
          <div className="alert alert--good" style={{ marginTop: '1.2rem', marginBottom: 0 }}>
            <div style={{ marginBottom: '0.6rem' }}>
              Board link for <strong>{freshToken.label}</strong>. Open it once on that
              device — it is shown <strong>only now</strong> and cannot be retrieved again.
            </div>
            <code
              style={{
                display: 'block', padding: '0.7rem', marginBottom: '0.7rem',
                background: '#fff', border: '3px solid var(--ink)', borderRadius: 12,
                fontSize: '0.8rem', wordBreak: 'break-all',
              }}
            >
              {freshToken.url}
            </code>
            <div className="row">
              <button
                className="clay-btn clay-btn--paper"
                style={{ fontSize: '0.9rem', padding: '0.5em 1em' }}
                onClick={() => {
                  void navigator.clipboard?.writeText(freshToken.url);
                  setNotice('Board link copied to your clipboard.');
                }}
              >
                Copy link
              </button>
              <button
                className="clay-btn clay-btn--paper"
                style={{ fontSize: '0.9rem', padding: '0.5em 1em' }}
                onClick={() => setFreshToken(null)}
              >
                Hide link
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Board</th><th>Status</th><th>Last seen</th><th>Created</th><th /></tr>
          </thead>
          <tbody>
            {devices.length === 0 && (
              <tr><td colSpan={5} className="muted">No boards linked to this classroom yet.</td></tr>
            )}
            {devices.map((d) => {
              const st = status(d);
              const live = !d.revokedAt && new Date(`${d.expiresAt}Z`) > new Date();
              return (
                <tr key={d.id}>
                  <td style={{ fontWeight: 800 }}>{d.label}</td>
                  <td><span className="mood-chip" style={{ background: st.color }}>{st.text}</span></td>
                  <td className="muted">{d.lastSeenAt ? d.lastSeenAt.slice(0, 16) : 'never'}</td>
                  <td className="muted">{d.createdAt.slice(0, 10)}</td>
                  <td>
                    {live ? (
                      <button
                        className="clay-btn clay-btn--berry"
                        style={{ fontSize: '0.8rem', padding: '0.45em 0.9em' }}
                        onClick={() => revoke(d)}
                      >
                        Revoke
                      </button>
                    ) : <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
