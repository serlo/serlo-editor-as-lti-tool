import { logger } from '../src/utils/logger'
import { EdusharingServer } from './edusharing/server'
import { ItslearningServer } from './itslearning'

const edusharingPort = 8100

new EdusharingServer().listen(edusharingPort, () => {
  logger.info('Mocked version of edusharing is ready.')
  logger.info(
    `Open http://localhost:${edusharingPort}/ to open the Serlo Editor via LTI (edusharing)`
  )
})

const itslearningPort = 8101

new ItslearningServer().listen(itslearningPort, () => {
  logger.info('Mocked version of itslearning is ready.')
  logger.info(
    `Open http://localhost:${itslearningPort}/ to open the Serlo Editor via LTI (itslearning)`
  )
})
