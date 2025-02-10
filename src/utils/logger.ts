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
