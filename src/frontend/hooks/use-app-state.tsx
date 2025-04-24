import { SerloEditorProps, SerloRendererProps } from '@serlo/editor'
import { useEffect, useState } from 'react'
import { jwtDecode } from 'jwt-decode'
import { AccessTokenType } from '../../backend/types/access-token'
import { GetEntityBody, GetEntityBodyType } from '../types/get-entity-body'

export type AppState =
  | { type: 'fetching-content' }
  | AppStateError
  | { type: 'editor'; content: SerloEditorProps['initialState'] }
  | { type: 'static-renderer'; content: SerloRendererProps['state'] }

export type AppStateError = {
  type: 'error'
  message: string
  imageURL?: string
}

export function useAppState() {
  const queryString = window.location.search
  const urlParams = new URLSearchParams(queryString)
  const accessToken = urlParams.get('accessToken')
  const ltik = urlParams.get('ltik')
  const resourceLinkIdFromUrl = urlParams.get('resourceLinkId')

  const [appState, setAppState] = useState<AppState>({
    type: 'fetching-content',
  })

  useEffect(() => {
    if (!accessToken) {
      setAppState({
        type: 'error',
        message: 'Error: Missing accessToken in search query parameters.',
      })
      return
    }
    if (!ltik) {
      setAppState({
        type: 'error',
        message: 'Error: Missing ltik in search query parameters.',
      })
      return
    }
    if (!resourceLinkIdFromUrl) {
      setAppState({
        type: 'error',
        message: 'Error: Missing resourceLinkId in search query parameters.',
      })
      return
    }

    const decodedAccessToken = jwtDecode(accessToken)
    if (!AccessTokenType.is(decodedAccessToken))
      throw new Error(
        `Unexpected type of access token. Got: ${JSON.stringify(decodedAccessToken)}`
      )

    const mode: 'read' | 'write' = decodedAccessToken.accessRight

    fetchEntity(accessToken, ltik)
      .then((entity) => {
        const content = entity.content ? JSON.parse(entity.content) : null
        setAppState({
          type: mode === 'write' ? 'editor' : 'static-renderer',
          content,
        })
      })
      .catch(() => {
        setAppState({
          type: 'error',
          message:
            'Fehler: Der Inhalt konnte nicht geladen werden. Versuche den Inhalt erneut über die Plattform zu öffnen.',
        })
      })

    function fetchEntity(accessToken: string, ltik: string) {
      return new Promise<GetEntityBody>((resolve, reject) => {
        fetch('/entity', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${ltik}`,
            'X-Access-Token': accessToken,
            'Content-Type': 'application/json;charset=utf-8',
          },
        })
          .then(async (res) => {
            if (res.status !== 200) {
              reject(
                new Error(
                  `Get entity request failed. Status code: ${res.status}`
                )
              )
              return
            }

            const entity = await res.json()

            if (!GetEntityBodyType.is(entity))
              throw new Error(
                `Unexpected response body for GET /entity. Got: ${JSON.stringify(entity)}`
              )

            resolve(entity)
          })
          .catch(() => {
            reject(new Error(`Get entity request failed`))
          })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { appState, ltik }
}
