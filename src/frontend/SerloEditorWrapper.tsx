import {
  defaultPlugins,
  EditorPluginType,
  SerloEditor,
  type SerloEditorProps,
} from '@serlo/editor'
import { jwtDecode } from 'jwt-decode'
import React, { useCallback, useRef } from 'react'

interface SerloContentProps {
  initialState: SerloEditorProps['initialState']
  ltik: string
}

interface Ltik {
  platformUrl: string
  clientId: string
  deploymentId: string
  platformCode: string
  contextId: string
  user: string
  s: string
  iat: number
}

// HACK: Skip rerendering SerloEditor. It leads to slate error (not finding DOM node) and resets the cursor position. But, I don't think we need to support rerendering currently. There is probably a better way to do this but the way `initialState` and `onChange` works makes it tricky.
const MemoSerloEditor = React.memo(SerloEditor, () => true)

export default function SerloEditorWrapper(props: SerloContentProps) {
  const { initialState, ltik } = props
  const queryString = window.location.search
  const urlParams = new URLSearchParams(queryString)
  const testingSecret = urlParams.get('testingSecret')
  const accessToken = urlParams.get('accessToken')

  const savePendingRef = useRef<boolean>(false)

  const saveTimeoutRef = useRef<number | undefined>(undefined)

  const save = useCallback(
    (newState: unknown) => {
      savePendingRef.current = false
      fetch('/entity', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          Authorization: `Bearer ${ltik}`,
        },
        body: JSON.stringify({
          accessToken,
          editorState: newState,
        }),
      }).then((res) => {
        if (res.status === 200) {
          // TODO: Show user content was saved successfully
        } else {
          // TODO: Handle failure
        }
      })
    },
    [accessToken, ltik]
  )

  const handleOnChange = useCallback(
    (newState: unknown) => {
      // If save already scheduled, cancel it
      if (savePendingRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      savePendingRef.current = true
      saveTimeoutRef.current = window.setTimeout(() => save(newState), 500)
    },
    [save]
  )

  const plugins = getPlugins(ltik)
  function getPlugins(ltik: string) {
    const { platformUrl } = jwtDecode(ltik) as Ltik
    const onEdusharing = platformUrl.includes('edu-sharing')
    if (onEdusharing) {
      return [
        ...defaultPlugins,
        EditorPluginType.EdusharingAsset,
        EditorPluginType.SerloInjection,
      ]
    }

    return defaultPlugins
  }

  return (
    <MemoSerloEditor
      initialState={initialState}
      onChange={handleOnChange}
      editorVariant="lti-tool"
      _testingSecret={testingSecret}
      plugins={plugins}
      _ltik={ltik}
    >
      {(editor) => {
        return <>{editor.element}</>
      }}
    </MemoSerloEditor>
  )
}
