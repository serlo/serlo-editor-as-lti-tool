import './util/sentry.js'
import { Provider as ltijs } from 'ltijs'
import path from 'path'

import * as Sentry from '@sentry/node'
import { NextFunction, Request, Response } from 'express'
import { registerLtiPlatforms } from './util/register-lti-platforms'
import config from '../utils/config'
import * as edusharing from './edusharing'
import * as editor from './editor-route-handlers'
import * as media from './media-route-handlers'
import { logger } from '../utils/logger'

async function setup() {
  ltijs.setup(
    // This needs to be random 256 bits encoded as a base64 string
    config.LTIJS_KEY,
    {
      url: config.MONGODB_URI,
      // @ts-expect-error @types/ltijs
      connection: {
        useNewUrlParser: true,
      },
    },
    {
      appUrl: '/lti/launch',
      loginUrl: '/lti/login',
      keysetUrl: '/lti/keys',
      dynRegRoute: '/lti/register',
      staticPath: path.join(__dirname, './../../dist/frontend'), // Path to static files
      cookies: {
        // Set secure to true if the testing platform is in a different domain and https is being used
        secure: config.ENVIRONMENT !== 'local',
        // Set sameSite to 'None' if the testing platform is in a different domain and https is being used
        sameSite: config.ENVIRONMENT === 'local' ? '' : 'None',
      },
      devMode: true,
    }
  )

  await edusharing.init().catch((error) => {
    logger.error(`Setup failed: ${error}`)
    throw new Error('Setup failed!')
  })

  // Disable authentication using ltik for some endpoints in edusharing embed flow.
  ltijs.whitelist(
    '/edusharing-embed/login',
    '/edusharing-embed/done',
    '/edusharing-embed/keys',
    // disage ai to make it easier to develop, revert afterwards
    '/ai/generate-content',
    '/ai/change-content'
  )

  // since whitelist is not allowing wildcards we ignore the invalidToken event for selected routes
  // @ts-expect-error types probably outdated
  ltijs.onInvalidToken(
    async (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/media/')) {
        next()
        return
      }
      return res.status(401).send(res.locals.err)
    }
  )

  const { app } = ltijs

  // Disable COEP
  app.use((_, res, next) => {
    res.removeHeader('Cross-Origin-Embedder-Policy')
    next()
  })

  // Open Serlo editor
  app.get('/app', editor.app)

  // Return LTI Deep Linking Response to platform
  app.get('/deeplinking-done', editor.deeplinkingDone)

  // Get content json
  app.get('/entity', editor.getEntity)

  // Save content json
  app.put('/entity', editor.putEntity)

  // Start edu-sharing embed flow for embedding edu-sharing content into the editor
  // Called when user clicks on "embed content from edusharing"
  app.get('/edusharing-embed/start', edusharing.start)

  // Login during edu-sharing embed flow
  // Receives an Authentication Request in payload
  // See: https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
  app.get('/edusharing-embed/login', edusharing.login)

  // Keys during edu-sharing embed flow
  app.use('/edusharing-embed/keys', edusharing.keys)

  // Finish edu-sharing embed flow
  // Called after the resource selection on Edusharing (within iframe) when user selected what resource to embed.
  // Receives a LTI Deep Linking Response Message in payload. Contains content_items array that specifies which resource should be embedded.
  // See: https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-message
  // See https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-example for an example response payload
  app.post('/edusharing-embed/done', edusharing.done)

  // Get edu-sharing embed html snippet
  app.get('/edusharing-embed/get', edusharing.get)

  app.get('/media/presigned-url', media.presignedUrl)
  app.use(media.proxyMiddleware)

  // app.post('/ai/generate-content', ai.generateContent)
  // app.post('/ai/change-content', ai.changeContent)

  // Successful LTI resource link launch
  // @ts-expect-error @types/ltijs
  ltijs.onConnect(editor.onConnect)

  // Successful LTI deep linking launch
  // @ts-expect-error @types/ltijs
  ltijs.onDeepLinking(editor.onDeepLinking)

  Sentry.setupExpressErrorHandler(app)

  await ltijs.deploy()

  await registerLtiPlatforms()
}

setup()
