interface RealtimeAuthClient {
  setAuth: (token?: string) => unknown
}

export function syncRealtimeAuth(
  realtime: RealtimeAuthClient,
  accessToken: string | null,
) {
  if (accessToken) {
    realtime.setAuth(accessToken)
    return
  }
  realtime.setAuth()
}
