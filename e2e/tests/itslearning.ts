import {
  expectEditorModeRead,
  expectEditorModeWrite,
} from '../utils/editor-mode'

Feature('Itslearning integration')

Scenario('Instructors have write access', ({ I }) => {
  I.setInstructorRole()

  openSerloEditorWithLTI(I)

  expectEditorModeWrite(I)
})

Scenario('Learners only have read access', ({ I }) => {
  I.setLearnerRole()

  openSerloEditorWithLTI(I)

  expectEditorModeRead(I)
})

function openSerloEditorWithLTI(I: CodeceptJS.I) {
  I.amOnPage('http://localhost:8101')
}
