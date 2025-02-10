import { SerloRenderer } from '@serlo/editor'
import SerloEditorWrapper from './SerloEditorWrapper'

import Error from './Error'

import '@serlo/editor/dist/style.css'
import { Layout } from './Layout'
import { useMoodleResize } from './hooks/use-moodle-resize'
import { useAppState } from './hooks/use-app-state'

function App() {
  const wrapperRef = useMoodleResize()

  const { appState, ltik } = useAppState()

  if (appState.type === 'fetching-content') return null
  if (appState.type === 'error') return <Error appState={appState} />
  if (appState.type === 'static-renderer') {
    return (
      <Layout>
        <div ref={wrapperRef} className="p-4 bg-white min-w-[600px]">
          <SerloRenderer
            state={appState.content}
            editorVariant="lti-tool"
            _ltik={ltik as string}
          />
        </div>
      </Layout>
    )
  }
  if (appState.type === 'editor') {
    return (
      <Layout>
        <div ref={wrapperRef}>
          <SerloEditorWrapper
            initialState={appState.content}
            ltik={ltik as string}
          />
        </div>
      </Layout>
    )
  }

  return <div>Invalid app state: {appState}</div>
}

export default App
