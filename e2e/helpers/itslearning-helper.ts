import { Helper } from 'codeceptjs'
import { Server } from 'http'

import { ItslearningServer } from '../../src/itslearning-mock/server'

class ItslearningHelper extends Helper {
  private itslearningMock: ItslearningServer
  private serverMock: Server

  constructor(config) {
    super(config)

    this.itslearningMock = new ItslearningServer()
  }

  _init(): void {
    this.serverMock = this.itslearningMock.listen(8101, () => {
      // eslint-disable-next-line no-console
      console.log('INFO: Mocked version of itslearning is ready.')
    })
  }

  _finishTest() {
    this.serverMock.close()
  }

  setInstructorRole() {
    this.itslearningMock.setInstructorRole()
  }

  setLearnerRole() {
    this.itslearningMock.setLearnerRole()
  }
}

export = ItslearningHelper
