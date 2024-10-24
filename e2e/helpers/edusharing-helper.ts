import { Helper } from 'codeceptjs'
import { Server } from 'http'

import { EdusharingServer } from '../../src/edusharing-mock/server'

class EdusharingHelper extends Helper {
  private edusharingMock: EdusharingServer
  private serverMock: Server

  constructor(config) {
    super(config)

    this.edusharingMock = new EdusharingServer()
  }

  _init(): void {
    this.serverMock = this.edusharingMock.listen(8100, () => {
      // eslint-disable-next-line no-console
      console.log('INFO: Mocked version of edusharing is ready.')
    })
  }

  _before() {
    this.edusharingMock.init()
  }

  _finishTest() {
    this.serverMock.close()
  }

  removePropertyInCustom(propertyName: string) {
    this.edusharingMock.removePropertyInCustom(propertyName)
  }
}

export = EdusharingHelper
