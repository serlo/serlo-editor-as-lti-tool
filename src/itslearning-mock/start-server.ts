import { ItslearningServer } from './server'

const itslearningPort = 8101
const itslearningServer = new ItslearningServer()

itslearningServer.listen(itslearningPort, () => {
  console.log('INFO: Mocked version of itslearning is ready.')
  console.log(
    `Open http://localhost:${itslearningPort}/ to open the Serlo Editor via LTI`
  )
})
