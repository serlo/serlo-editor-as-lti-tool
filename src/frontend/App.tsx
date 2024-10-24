import {
  SerloRenderer,
  SerloRendererProps,
  type SerloEditorProps,
} from '@serlo/editor'
import { useEffect, useState } from 'react'
import SerloEditorWrapper from './SerloEditorWrapper'
import { jwtDecode } from 'jwt-decode'
import { type AccessToken, type Entity } from '../backend'
import copyPluginToClipboardImage from './assets/copy-plugin-to-clipboard.png'
import Error from './Error'

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

function App() {
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

    const decodedAccessToken = jwtDecode(accessToken) as AccessToken
    const mode: 'read' | 'write' = decodedAccessToken.accessRight

    fetchEntity(accessToken, ltik)
      .then((entity) => {
        if (entity.content === 'Invalid access token') {
          setAppState({
            type: 'error',
            message: 'Fehler: Bitte öffne den Inhalt erneut.',
          })
          return
        }

        const resourceLinkIdFromDb = entity.resource_link_id
        if (!resourceLinkIdFromDb || !resourceLinkIdFromUrl) {
          setAppState({
            type: 'error',
            message: 'Error: resource_link_id was missing!',
          })
          return
        }

        if (resourceLinkIdFromDb !== resourceLinkIdFromUrl) {
          setAppState({
            type: 'error',
            // In German because we expect the user to see it
            message:
              'Auf itslearning wurde eine Kopie erstellt. Leider ist dies aus technischen Gründen noch nicht möglich. Du kannst allerdings einen neuen Serlo Editor Inhalt auf itslearning erstellen und die gewünschten Inhalte per "Plugin in die Zwischenablage kopieren" & Strg-V dorthin übernehmen.',
            imageURL: copyPluginToClipboardImage,
          })
          return
        }

        const content = JSON.parse(entity.content)
        // console.log('content: ', content)
        setAppState({
          type: mode === 'write' ? 'editor' : 'static-renderer',
          content,
        })
      })
      .catch(() => {
        setAppState({
          type: 'error',
          message: 'Error: Failed to fetch entity from database.',
        })
      })

    function fetchEntity(accessToken: string, ltik: string) {
      return new Promise<Entity>((resolve, reject) => {
        const queryString = new URLSearchParams()
        queryString.append('accessToken', accessToken)

        fetch('/entity?' + queryString, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${ltik}`,
          },
        })
          .then(async (res) => {
            if (res.status !== 200) reject()

            const entity = (await res.json()) as Entity
            // console.log('entity: ', entity)
            resolve(entity)
          })
          .catch(() => {
            reject()
          })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (appState.type === 'fetching-content') return null
  if (appState.type === 'error') return <Error appState={appState} />
  if (appState.type === 'static-renderer') {
    return (
      <div
        style={{ padding: '1rem', backgroundColor: 'white', minWidth: '600px' }}
      >
        <SerloRenderer
          state={appState.content}
          editorVariant="lti-tool"
          _ltik={ltik as string}
        />
      </div>
    )
  }
  if (appState.type === 'editor') {
    return (
      <SerloEditorWrapper
        initialState={appState.content}
        ltik={ltik as string}
      />
    )
  }

  return <div>Invalid app state: {appState}</div>
}

export default App
