export type SessionAccessTokenListener = (accessToken: string | null) => void

export function createSessionEvents() {
  const listeners = new Set<SessionAccessTokenListener>()
  return {
    emit(accessToken: string | null) {
      listeners.forEach((listener) => listener(accessToken))
    },
    subscribe(listener: SessionAccessTokenListener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export const sessionEvents = createSessionEvents()
