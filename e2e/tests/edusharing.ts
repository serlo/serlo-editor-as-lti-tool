import { expectEditorModeRead } from '../utils/editor-mode'
import * as jwt from 'jsonwebtoken'
import type { AccessToken } from '../../src/backend/types/access-token'

Feature('Edusharing integration')

Scenario('The editor can be called via the LTI Workflow', ({ I }) => {
  openSerloEditorWithLTI(I)

  expectEditorOpenedSuccessfully(I)
})

Scenario(
  'Succeeds when the editor is opened in view mode (postContentApiUrl is missing)',
  ({ I }) => {
    I.removePropertyInCustom('postContentApiUrl')

    openSerloEditorWithLTI(I)

    expectEditorModeRead(I)
  }
)

Scenario(
  'The editor saves automatically when it is open for long enough after there have been changes made.',
  ({ I }) => {
    openSerloEditorWithLTI(I)

    expectEditorOpenedSuccessfully(I)

    I.click('$add-new-plugin-row-button')
    I.click('Box')
    I.type('Test title')

    I.wait(5)

    openSerloEditorWithLTI(I)

    I.see('Test title')
  }
)

Scenario(
  "Can't modify `accessToken` to gain access to other entities",
  async ({ I }) => {
    openSerloEditorWithLTI(I)

    const urlString = await I.grabCurrentUrl()
    const url = new URL(urlString)
    const originalAccessToken = url.searchParams.get('accessToken')
    const originalAccessTokenHeader = originalAccessToken.split('.')[0]
    const originalAccessTokenSignature = originalAccessToken.split('.')[2]
    const decodedAccessToken = jwt.decode(originalAccessToken) as AccessToken
    decodedAccessToken.entityId = '32973844792734'
    const tamperedJwtBody = Buffer.from(
      JSON.stringify(decodedAccessToken)
    ).toString('base64')
    const tamperedJwt = `${originalAccessTokenHeader}.${tamperedJwtBody}.${originalAccessTokenSignature}`

    url.searchParams.set('accessToken', tamperedJwt)

    I.amOnPage(url.toString())

    I.see(
      'Fehler: Der Inhalt konnte nicht geladen werden. Versuche den Inhalt erneut über die Plattform zu öffnen.'
    )
  }
)

Scenario.skip('Assets from edu-sharing can be included', ({ I }) => {
  openSerloEditorWithLTI(I)

  expectEditorOpenedSuccessfully(I)

  embedEdusharingAsset(I)

  I.wait(3)

  I.seeElement('div[data-embed-type="image"]')
})

function embedEdusharingAsset(I: CodeceptJS.I) {
  I.click('$add-new-plugin-row-button')
  I.click('Edu-sharing Inhalt')
  I.click('$plugin-edusharing-select-content-button')
  I.switchTo({ css: '[data-qa=plugin-edusharing-selection-iframe]' }) // switch to iframe
  I.click('#edusharing-embed-image-select')
  I.wait(1)
  I.switchTo() // switch back to main page
}

function openSerloEditorWithLTI(I: CodeceptJS.I) {
  I.amOnPage('http://localhost:8100')
}

function expectEditorOpenedSuccessfully(I: CodeceptJS.I) {
  I.seeElement('$add-new-plugin-row-button')
}
