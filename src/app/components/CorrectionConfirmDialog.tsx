import { useState } from 'react'
import Modal from './Modal'

type CorrectionConfirmDialogProps = {
  /** Readable labels of the matches the correction would undo. */
  invalidated: string[]
  onConfirm(): void
  onCancel(): void
}

/** Destructive confirmation: focus starts on Cancelar so Enter never undoes matches by accident. */
export default function CorrectionConfirmDialog({ invalidated, onConfirm, onCancel }: CorrectionConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null)

  function confirm() {
    try {
      onConfirm()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível aplicar a correção.')
    }
  }

  return (
    <Modal title="Esta correção anula jogos já definidos" onCancel={onCancel}>
      <p>Se confirmar, estes jogos perdem o resultado ou os jogadores e voltam a ficar por disputar:</p>
      <ul>
        {invalidated.map(label => <li key={label}>{label}</li>)}
      </ul>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="actions">
        <button type="button" onClick={onCancel}>Cancelar</button>
        <button type="button" className="danger" onClick={confirm}>Confirmar correção</button>
      </div>
    </Modal>
  )
}
