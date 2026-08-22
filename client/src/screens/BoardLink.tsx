import { useEffect, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Raccoon } from '../components/Raccoon';
import { api } from '../lib/api';

/**
 * Links a device to one classroom.
 *
 * Arriving at /board/link/<token> claims automatically and then **replaces**
 * the history entry with /board. That matters: a board's address bar sits at
 * child height on a wall, and a token left in the URL or in history can be
 * read — or photographed — by anyone in the room. After the exchange the
 * credential exists only as an httpOnly cookie this page cannot read.
 *
 * Arriving at /board/link with no token shows a paste box, which is the path
 * a teacher takes when setting a board up by hand.
 */
export function BoardLink() {
  const { token } = useParams();
  const navigate = useNavigate();
  // Set when a board was bounced here mid-day by a revoked or expired link.
  const wasExpired = Boolean((useLocation().state as { expired?: boolean } | null)?.expired);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const claim = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/kiosk/claim', { token: value });
      navigate('/board', { replace: true });   // drops the token from history
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (token) void claim(token);
    // Claiming exactly once, on the token in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pasted.trim()) void claim(pasted.trim());
  };

  return (
    <div className="center-page">
      <div className="clay" style={{ padding: 'clamp(1.5rem, 4vw, 2.6rem)', width: 'min(560px, 100%)' }}>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Raccoon furColor="#43b3f5" hat="party" score={token && busy ? 3 : 4} size={150} />
        </div>
        <h1 className="display" style={{ fontSize: '1.9rem', textAlign: 'center' }}>
          {token && busy ? 'Linking this board…' : 'Link this board'}
        </h1>

        {error && <div className="alert">{error}</div>}
        {wasExpired && !error && (
          <div className="alert">
            This board's link was revoked or has expired. Ask a teacher to generate a new one.
          </div>
        )}

        {!token || error || wasExpired ? (
          <>
            <p className="muted" style={{ textAlign: 'center' }}>
              Paste the board link a teacher generated for this classroom.
            </p>
            <form onSubmit={submit}>
              <label className="field">
                <span>Board link or code</span>
                <input
                  value={pasted}
                  onChange={(e) => {
                    // Accept either the whole URL or just the code.
                    const v = e.target.value;
                    setPasted(v.includes('/board/link/') ? v.split('/board/link/')[1] : v);
                  }}
                  placeholder="https://…/board/link/…"
                  autoFocus
                />
              </label>
              <button className="clay-btn clay-btn--block clay-btn--grass" disabled={busy || !pasted.trim()}>
                {busy ? 'Linking…' : 'Link this board'}
              </button>
            </form>
            <p className="muted" style={{ textAlign: 'center', fontSize: '0.85rem', marginBottom: 0 }}>
              A linked board can only show this one classroom's roster and record its
              check-ins. It carries no teacher sign-in.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
