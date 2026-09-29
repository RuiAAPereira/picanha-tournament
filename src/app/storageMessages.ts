import { STORAGE_ERROR_CODES, type StorageErrorCode } from '../platform/tournamentRepository'

export type StorageOperation = 'load' | 'save' | 'export'

export function storageErrorCode(error: unknown): StorageErrorCode {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  return (STORAGE_ERROR_CODES as readonly unknown[]).includes(code) ? code as StorageErrorCode : 'unexpected'
}

const MESSAGES: Record<StorageOperation, Partial<Record<StorageErrorCode, string>> & { fallback: string }> = {
  load: {
    unwritable: 'A pasta de dados não permite escrita. Pode usar a aplicação, mas o torneio não ficará guardado.',
    busy: 'Os dados estão a ser usados por outro programa. Pode continuar, mas o torneio pode não ficar guardado.',
    corrupt: 'O ficheiro de dados está danificado e não foi possível abrir o torneio anterior.',
    schema_newer: 'Os dados foram guardados por uma versão mais recente da aplicação e não podem ser abertos.',
    fallback: 'Não foi possível abrir o torneio guardado.',
  },
  save: {
    unwritable: 'Não foi possível guardar: a pasta de dados não permite escrita.',
    busy: 'Não foi possível guardar: os dados estão a ser usados por outro programa.',
    history_conflict: 'Não foi possível guardar: o histórico guardado não corresponde a este torneio.',
    invalid_snapshot: 'Não foi possível guardar: os dados do torneio não são válidos.',
    schema_newer: 'Não foi possível guardar: os dados pertencem a uma versão mais recente da aplicação.',
    corrupt: 'Não foi possível guardar: o ficheiro de dados está danificado.',
    fallback: 'Não foi possível guardar o torneio.',
  },
  export: {
    invalid_destination: 'Não foi possível exportar a cópia de segurança: o nome do ficheiro não é válido.',
    not_found: 'Não foi possível exportar a cópia de segurança: o torneio ainda não está guardado.',
    unwritable: 'Não foi possível exportar a cópia de segurança: a pasta de cópias não permite escrita.',
    busy: 'Não foi possível exportar a cópia de segurança: os dados estão a ser usados por outro programa.',
    fallback: 'Não foi possível exportar a cópia de segurança.',
  },
}

/** Operation-specific Portuguese copy, chosen by the storage error code. */
export function storageErrorMessage(operation: StorageOperation, error: unknown): string {
  const messages = MESSAGES[operation]
  return messages[storageErrorCode(error)] ?? messages.fallback
}
