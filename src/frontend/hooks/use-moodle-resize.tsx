import { useEffect } from 'react'
import useResizeObserver from 'use-resize-observer'

/**
 * for moodle: resize iframe on content change
 */
export function useMoodleResize() {
  const { ref: wrapperRef } = useResizeObserver<HTMLDivElement>({
    onResize: ({ height: wrapperHeight }) => {
      const height = Math.max((wrapperHeight ?? 0) + 200, 500)
      const data = JSON.stringify({ subject: 'lti.frameResize', height })
      window.parent?.postMessage(data, '*')
    },
  })

  useEffect(() => {
    // remove iframe border on init
    window.parent?.postMessage(
      JSON.stringify({ subject: 'lti.removeBorder' }),
      '*'
    )
  }, [])

  return wrapperRef
}
