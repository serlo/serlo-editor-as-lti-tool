import { Response } from 'express'
import _ from 'lodash'

export function createAutoFormResponse({
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
  const escapedTargetUrl = _.escape(targetUrl)
  const formDataHtml = Object.entries(params)
    .map(([name, value]) => {
      const escapedValue = _.escape(value)
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
}
