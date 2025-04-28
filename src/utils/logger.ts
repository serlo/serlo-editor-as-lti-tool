import config from './config'
import * as Sentry from '@sentry/node'

export const logger = {
  info(...args: Parameters<typeof console.log>) {
    // eslint-disable-next-line no-console
    console.log('INFO:', ...args)
  },
  error(...args: Parameters<typeof console.error>) {
    // eslint-disable-next-line no-console
    console.error('ERROR:', ...args)
  },
}

export function createAndLogError(message: string) {
  const error = new Error(message)

  Sentry.captureException(error)

  if (config.ENVIRONMENT === 'local') {
    // eslint-disable-next-line no-console
    console.log('Error:', message)
  }

  return error
}
