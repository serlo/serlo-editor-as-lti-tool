import { serverLog } from '../utils/server-log'
import { EdusharingServer } from './server'

const edusharingPort = 8100
const edusharingServer = new EdusharingServer()

edusharingServer.listen(edusharingPort, () => {
  serverLog('INFO: Mocked version of edusharing is ready.')
  serverLog(
    `Open http://localhost:${edusharingPort}/ to open the Serlo Editor via LTI`
  )
})
