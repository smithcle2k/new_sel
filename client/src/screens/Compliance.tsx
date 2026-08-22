import { useEffect, useState } from 'react';
import { api, type Classroom, type ComplianceRow } from '../lib/api';
import { moodFor } from '../lib/moods';

/**
 * The administrative compliance table. Every row is a real check-in joined, at
 * query time, to the indicators of the school's home state — so the citations
 * an administrator exports always match the state currently on file.
 */
export function ComplianceView({ classroom, state }: { classroom: Classroom; state: string }) {
  const [rows, setRows] = useState<ComplianceRow[]>([]);
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<{ rows: ComplianceRow[] }>(`/reports/classroom/${classroom.id}/compliance?days=${days}`)
      .then((d) => alive && setRows(d.rows))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [classroom.id, days]);

  const distinctChildren = new Set(rows.map((r) => r.student_id)).size;
  const distinctCodes = new Set(rows.map((r) => r.standard_code).filter(Boolean)).size;

  return (
    <div className="stack">
      <div className="topbar" style={{ marginBottom: 0 }}>
        <label className="row" style={{ gap: '0.5rem' }}>
          <span style={{ fontFamily: 'var(--font-round)', fontWeight: 800 }}>Range</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{
              fontWeight: 800, padding: '0.55em 0.9em', border: '4px solid var(--ink)',
              borderRadius: 'var(--radius-sm)', background: '#fff', color: 'var(--ink)',
            }}
          >
            <option value={1}>Today</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <span className="muted">
          {distinctChildren} children · {distinctCodes} distinct {state} indicators evidenced
        </span>
        <div className="spacer" />
        {/* A plain link, so the browser handles the download with the session cookie. */}
        <a
          className="clay-btn clay-btn--grass"
          style={{ textDecoration: 'none', display: 'inline-block' }}
          href={`/api/reports/classroom/${classroom.id}/compliance.csv?days=${days}`}
        >
          ⤓ Export CSV
        </a>
      </div>

      {error && <div className="alert">{error}</div>}
      {loading && <p className="muted">Joining check-ins to {state} standards…</p>}

      {!loading && rows.length === 0 && (
        <div className="clay" style={{ padding: '2rem', textAlign: 'center' }}>
          <h2 className="display">No check-ins in this range yet</h2>
          <p className="muted">Open the kiosk and let the children plant their first seeds.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Child</th><th>Mood</th>
                <th>Standard</th><th>Domain</th><th>Indicator met</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const mood = moodFor(r.mood_score);
                return (
                  <tr key={`${r.student_id}-${r.date}-${r.standard_code}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                    <td style={{ fontWeight: 800 }}>{r.first_name} {r.last_initial}</td>
                    <td>
                      <span className="mood-chip" style={{ background: mood.color }}>
                        {r.mood_score} · {r.mood_label}
                      </span>
                    </td>
                    <td><span className="code-chip">{r.standard_code ?? '—'}</span></td>
                    <td className="muted">{r.domain ?? '—'}</td>
                    <td>{r.indicator ?? 'No mapping for this state.'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
