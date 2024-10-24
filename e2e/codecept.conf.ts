import { setHeadlessWhen, setCommonPlugins } from '@codeceptjs/configure'

setHeadlessWhen(process.env.HEADLESS)

// enable all common plugins https://github.com/codeceptjs/configure#setcommonplugins
setCommonPlugins()

export const config: CodeceptJS.MainConfig = {
  tests: './tests/**/*.ts',
  output: './output',
  helpers: {
    Playwright: {
      browser: 'chromium',
      url: 'http://localhost:3000',
      show: true,
    },
    EdusharingHelper: {
      require: './helpers/edusharing-helper.ts',
    },
    ItslearningHelper: {
      require: './helpers/itslearning-helper.ts',
    },
  },
  plugins: {
    customLocator: {
      enabled: true,
      // Allows data-qa attributes to be selected with $ prefix. E.g
      // `I.click({ css: '[data-qa=register_button]'})` becomes `I.click('$register_button')`
      attribute: 'data-qa',
    },
  },
  name: 'serlo-editor-as-lti-tool',
}
