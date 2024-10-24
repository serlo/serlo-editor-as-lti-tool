import {
  expireAccessToken,
  modifyAccessTokenEntityId,
} from '../utils/access-token'

Feature('Itslearning integration')

Scenario('Instructors have write access', ({ I }) => {
  I.setInstructorRole()

  openSerloEditorWithLTI(I)

  I.see('Schreibe etwas')
  I.seeElement('$add-new-plugin-row-button')
  I.seeElementInDOM('#serlo-root')
})

Scenario('Learners only have read access', ({ I }) => {
  I.setLearnerRole()

  openSerloEditorWithLTI(I)

  I.dontSee('Schreibe etwas')
  I.dontSeeElement('$add-new-plugin-row-button')
  I.seeElementInDOM('#serlo-root')
})

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

function openSerloEditorWithLTI(I: CodeceptJS.I) {
  I.amOnPage('http://localhost:8101')
}
