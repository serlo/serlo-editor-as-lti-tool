import { logger } from '../src/utils/logger'
import { EdusharingServer } from './edusharing/server'

const edusharingPort = 8100

new EdusharingServer().listen(edusharingPort, () => {
  logger.info('Mocked version of edusharing is ready.')
  logger.info(
    `Open http://localhost:${edusharingPort}/ to open the Serlo Editor via LTI (edusharing)`
  )
})
