/// <reference types='codeceptjs' />

/*
This file is supposed to be auto generated with `npx codeceptjs def ./e2e`
Unfortunately there is a problem with the custom helpers so you have to either manually add/change types
or remove the custom helpers from the config, run `def` and them add them again in the config and here as well.
*/

type ChaiWrapper = import('codeceptjs-chai')
type EdusharingHelper = import('./helpers/edusharing-helper')
type ItslearningHelper = import('./helpers/itslearning-helper')

declare namespace CodeceptJS {
  interface SupportObject {
    I: I
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current: any
  }
  interface Methods
    extends Playwright,
      ChaiWrapper,
      REST,
      JSONResponse,
      EdusharingHelper,
      ItslearningHelper {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface I extends WithTranslation<Methods> {}
  namespace Translation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Actions {}
  }
}
