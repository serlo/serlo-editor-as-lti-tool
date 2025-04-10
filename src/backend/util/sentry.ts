import * as Sentry from '@sentry/node'
import config from '../../utils/config'

Sentry.init({
  dsn: 'https://ce6c45bcf8c8c09692ffa88c6f563837@o115070.ingest.us.sentry.io/4508738398060544',
  // Do not send events when 'local'
  enabled: process.env.ENVIRONMENT !== 'local',
  environment: config.ENVIRONMENT,
})
