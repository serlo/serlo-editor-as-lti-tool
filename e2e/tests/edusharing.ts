Feature('Edusharing integration')

Scenario('The editor can be called via the LTI Workflow', ({ I }) => {
  openSerloEditorWithLTI(I)

  expectEditorOpenedSuccessfully(I)
})

Scenario(
  'Fails when the LTI custom claim (sent by edusharing) is missing a non-optional property',
  ({ I }) => {
    I.removePropertyInCustom('dataToken')

    openSerloEditorWithLTI(I)

    I.see("Unexpected type of LTI 'custom' claim.")
  }
)

Scenario(
  'Succeeds when the editor is opened in view mode (postContentApiUrl is missing)',
  ({ I }) => {
    I.removePropertyInCustom('postContentApiUrl')

    openSerloEditorWithLTI(I)

    I.dontSee('Schreibe etwas')
    I.dontSeeElement('$add-new-plugin-row-button')
    I.seeElementInDOM('#serlo-root')
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

Scenario('Assets from edu-sharing can be included', ({ I }) => {
  openSerloEditorWithLTI(I)

  expectEditorOpenedSuccessfully(I)

  embedEdusharingAsset(I)

  I.seeElement('img[title="Serlo Testbild"]')
})

function embedEdusharingAsset(I: CodeceptJS.I) {
  I.click('$add-new-plugin-row-button')
  I.click('Edu-sharing Inhalt')
  I.click('$plugin-edusharing-select-content-button')
}

function openSerloEditorWithLTI(I: CodeceptJS.I) {
  I.amOnPage('http://localhost:8100')
}

function expectEditorOpenedSuccessfully(I: CodeceptJS.I) {
  I.see('Schreibe etwas')
}
