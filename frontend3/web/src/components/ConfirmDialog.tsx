import { useState } from 'react';
import Modal from './Modal';

export default function ConfirmDialog({
  message,
  onConfirm,
  onClose,
}: {
  message: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Confirmation" onClose={onClose}>
      <p>{message}</p>
      {error && <div className="alert">{error}</div>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Annuler
        </button>
        <button className="btn btn-danger" onClick={confirm} disabled={busy} autoFocus>
          {busy ? 'Suppression…' : 'Supprimer'}
        </button>
      </div>
    </Modal>
  );
}
