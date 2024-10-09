import type { Response } from 'express'
import * as t from 'io-ts'

export function createAutoFromResponse({
  res,
  method = 'GET',
  targetUrl,
  params,
}: {
  res: Response
  method?: 'GET' | 'POST'
  targetUrl: string
  params: Record<string, string>
}) {
  const escapedTargetUrl = escapeHTML(targetUrl)
  const formDataHtml = Object.entries(params)
    .map(([name, value]) => {
      const escapedValue = escapeHTML(value)
      return `<input type="hidden" name="${name}" value="${escapedValue}" />`
    })
    .join('\n')

  res.setHeader('Content-Type', 'text/html')
  res.send(
    `<!DOCTYPE html>
     <html>
     <head><title>Redirect to ${escapedTargetUrl}</title></head>
     <body>
       <form id="form" action="${escapedTargetUrl}" method="${method}">
         ${formDataHtml}
       </form>
       <script type="text/javascript">
         document.getElementById("form").submit();
       </script>
     </body>
     </html>
    `.trim()
  )
  res.end()
}

function escapeHTML(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export const EdusharingAssetDecoder = t.type({
  nodeId: t.string,
  repositoryId: t.string,
})

export const JwtDeepflowResponseDecoder = t.type({
  'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': t.array(
    t.type({
      custom: EdusharingAssetDecoder,
    })
  ),
})

export const DeeplinkNonce = t.type({ nonce: t.string })
export const DeeplinkLoginData = t.type({
  dataToken: t.string,
  nodeId: t.string,
  user: t.string,
})

// Define type for the LTI claim https://purl.imsglobal.org/spec/lti/claim/custom
// Partial contains optional properties.
// TODO: rename to not confuse it with other custom types
export const LtiCustomType = t.intersection([
  t.type({
    getContentApiUrl: t.string,
    appId: t.string,
  }),
  DeeplinkLoginData,
  t.partial({
    fileName: t.string,
    /** Is set when editor was opened in edit mode */
    postContentApiUrl: t.string,
    version: t.string,
  }),
])
