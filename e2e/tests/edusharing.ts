import {
  expireAccessToken,
  modifyAccessTokenEntityId,
} from '../utils/access-token'
import { expectEditorModeRead } from '../utils/editor-mode'

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
  "Can't save using an `accessToken` token with invalid `entityId`",
  async ({ I }) => {
    openSerloEditorWithLTI(I)

    const urlString = await I.grabCurrentUrl()
    const url = new URL(urlString)
    const modifiedAccessToken = modifyAccessTokenEntityId(url)
    url.searchParams.set('accessToken', modifiedAccessToken)

    I.amOnPage(url.toString())

    I.see('Fehler: Bitte öffne den Inhalt erneut.')
  }
)

Scenario("Can't save using an expired `accessToken`", async ({ I }) => {
  openSerloEditorWithLTI(I)

  const urlString = await I.grabCurrentUrl()
  const url = new URL(urlString)
  const expiredAccessToken = expireAccessToken(url)
  url.searchParams.set('accessToken', expiredAccessToken)

  I.amOnPage(url.toString())

  I.see('Fehler: Bitte öffne den Inhalt erneut.')
})

Scenario('Assets from edu-sharing can be included', ({ I }) => {
  openSerloEditorWithLTI(I)

  expectEditorOpenedSuccessfully(I)

  embedEdusharingAsset(I)

  I.seeElement('div[data-embed-type="image"]')
})

function embedEdusharingAsset(I: CodeceptJS.I) {
  I.click('$add-new-plugin-row-button')
  I.click('Edu-sharing Inhalt')
  I.click('$plugin-edusharing-select-content-button')
  I.switchTo('iframe') // switch to first iframe
  I.click('#edusharing-embed-image-select')
  I.switchTo() // switch back to main page
}

function openSerloEditorWithLTI(I: CodeceptJS.I) {
  I.amOnPage('http://localhost:8100')
}

function expectEditorOpenedSuccessfully(I: CodeceptJS.I) {
  I.see('Schreibe etwas')
}
