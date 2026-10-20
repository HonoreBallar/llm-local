import { useState } from 'react';
import { Sparkle } from './Icons';

interface Props {
  onUnlock: (password: string) => Promise<boolean>;
}

export default function LockScreen({ onUnlock }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  return (
    <div className="lock">
      <form
        className="lock-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!password || pending) return;
          setPending(true);
          setError('');
          try {
            if (!(await onUnlock(password))) setError('Mot de passe incorrect.');
          } catch {
            setError('Serveur injoignable, réessaie dans un instant.');
          } finally {
            setPending(false);
          }
        }}
      >
        <Sparkle size={34} className="accent" />
        <h1>Assistant local</h1>
        <p className="muted">Saisis le mot de passe pour accéder au chat.</p>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="lock-error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={!password || pending}>
          {pending ? 'Vérification…' : 'Entrer'}
        </button>
      </form>
    </div>
  );
}
