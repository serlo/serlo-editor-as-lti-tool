import * as Sentry from '@sentry/node'

export function errorMessageToUser(errorDetails: string) {
  Sentry.captureException(new Error(errorDetails))

  return `Es ist leider ein Fehler aufgetreten. Bitte wende dich an lars@serlo.org mit dieser Fehlermeldung: ${errorDetails}`
}
