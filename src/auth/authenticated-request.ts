import type { Session } from './session'

export interface RequestResult {
  statusCode: number
}

export interface AuthenticatedRequestDependencies<
  TOption,
  TResult extends RequestResult,
> {
  send: (option: TOption, accessToken: string | null) => Promise<TResult>
  refresh: (refreshToken: string) => Promise<Session>
  getSession: () => Session | null
  setSession: (session: Session) => void
  onUnauthorized: () => void
  isPublic: (option: TOption) => boolean
}

export function createAuthenticatedRequester<
  TOption,
  TResult extends RequestResult,
>(dependencies: AuthenticatedRequestDependencies<TOption, TResult>) {
  let refreshInFlight: Promise<Session> | null = null
  let unauthorizedNotified = false

  const notifyUnauthorized = () => {
    if (unauthorizedNotified) return
    unauthorizedNotified = true
    dependencies.onUnauthorized()
  }

  const refreshSession = async (refreshToken: string) => {
    if (!refreshInFlight) {
      const current = dependencies.refresh(refreshToken)
      refreshInFlight = current
      current.finally(() => {
        if (refreshInFlight === current) refreshInFlight = null
      }).catch(() => undefined)
    }
    const session = await refreshInFlight
    dependencies.setSession(session)
    unauthorizedNotified = false
    return session
  }

  return async (option: TOption): Promise<TResult> => {
    const currentSession = dependencies.getSession()
    const first = await dependencies.send(option, currentSession?.access_token ?? null)
    if (first.statusCode !== 401 || dependencies.isPublic(option)) {
      return first
    }

    if (!currentSession?.refresh_token) {
      notifyUnauthorized()
      return first
    }

    try {
      const refreshed = await refreshSession(currentSession.refresh_token)
      const retried = await dependencies.send(option, refreshed.access_token)
      if (retried.statusCode === 401) notifyUnauthorized()
      return retried
    } catch {
      notifyUnauthorized()
      return first
    }
  }
}
