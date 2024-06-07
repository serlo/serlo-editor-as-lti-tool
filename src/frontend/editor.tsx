import { SerloEditor } from '@serlo/editor'
import { useEffect, useState } from 'react'

function Editor() {
  // TODO: Make editorState always contain valid value
  const [editorState, setEditorState] = useState<string | undefined>(undefined)
  const [savePending, setSavePending] = useState<boolean>(false)

  // Save content if there are unsaved changed
  useEffect(() => {
    if (!savePending) return

    setTimeout(saveContent, 3000)
    function saveContent() {
      fetch('/mutate', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Authorization: `Bearer ${ltik}`,
        },
        body: JSON.stringify({
          accessToken,
          editorState,
        }),
      }).then((res) => {
        if (res.status === 200) {
          setSavePending(false)
        } else {
          // TODO: Handle failure
        }
      })
    }
  }, [savePending])

  const queryString = window.location.search
  const urlParams = new URLSearchParams(queryString)

  const accessToken = urlParams.get('accessToken')
  const ltik = urlParams.get('ltik')
  if (!accessToken || !ltik) return <p>Access token or ltik was missing!</p>

  const isDeeplink = urlParams.get('deeplink')

  return (
    <>
      <div style={{ marginBottom: '3rem' }}>
        {savePending || !editorState ? (
          // Show close button but disable it
          <button disabled>Close</button>
        ) : isDeeplink ? (
          // Enable close button
          <form method="post" action="http://localhost:3000/finish-deeplink">
            <input type="hidden" name="accessToken" value={accessToken} />
            <input type="hidden" name="ltik" value={ltik} />
            <input type="hidden" name="editorState" value={editorState} />
            <button type="submit">Close</button>
          </form>
        ) : (
          // TODO: Maybe close window/tab
          <button>Close</button>
        )}
      </div>
      <SerloEditor
        onChange={({ changed, getDocument }) => {
          if (!changed) return
          const newState = getDocument()
          if (!newState) return
          setEditorState(JSON.stringify(newState))
          setSavePending(true)
        }}
      >
        {(editor) => {
          return <>{editor.element}</>
        }}
      </SerloEditor>
    </>
  )
}

export default Editor
