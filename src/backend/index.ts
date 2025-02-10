import './util/sentry.js'
import { Provider as ltijs } from 'ltijs'
import path from 'path'

import * as Sentry from '@sentry/node'
import { NextFunction, Request, Response } from 'express'
import { registerLtiPlatforms } from './util/register-lti-platforms'
import config from '../utils/config'
import * as edusharing from './edusharing'
import * as editor from './editor-route-handlers'
import * as ai from './ai-route-handlers'
import * as media from './media-route-handlers'
import { logger } from '../utils/logger'

const ltijsKey = config.LTIJS_KEY

export interface AccessToken {
  entityId: string
  accessRight: 'read' | 'write'
}

export interface Entity {
  id: number
  iss: string
  resource_link_id?: string
  custom_claim_id?: string
  edusharing_node_id?: string
  content: string
  user_when_first_opened: string
  id_token_when_first_opened: string
  id_token_when_created?: string
}

const setup = async () => {
  ltijs.setup(
    ltijsKey,
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
        secure: config.ENVIRONMENT !== 'local', // Set secure to true if the testing platform is in a different domain and https is being used
        sameSite: config.ENVIRONMENT === 'local' ? '' : 'None', // Set sameSite to 'None' if the testing platform is in a different domain and https is being used
      },
      // Disables cookie verification. Temporary hack to make it work if third-party cookies are blocked. Later, use newer ltijs version that should solve this without requiring devMode.
      devMode:
        config.ENVIRONMENT === 'local' ||
        config.ENVIRONMENT === 'development' ||
        config.ENVIRONMENT === 'staging',
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

  // Opens Serlo editor
  app.get('/app', editor.app)

  app.get('/deeplinking-done', editor.deeplinkingDone)

  // Endpoint to get content
  app.get('/entity', editor.getEntity)

  // Endpoint to save content
  app.put('/entity', editor.putEntity)

  // Provide endpoint to start embed flow on edu-sharing
  // Called when user clicks on "embed content from edusharing"
  app.get('/edusharing-embed/start', edusharing.start)

  // Receives an Authentication Request in payload
  // See: https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
  app.get('/edusharing-embed/login', edusharing.login)

  app.use('/edusharing-embed/keys', edusharing.keys)

  // Called after the resource selection on Edusharing (within iframe) when user selected what resource to embed.
  // Receives a LTI Deep Linking Response Message in payload. Contains content_items array that specifies which resource should be embedded.
  // See: https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-message
  // See https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-example for an example response payload
  app.post('/edusharing-embed/done', edusharing.done)

  app.get('/edusharing-embed/get', edusharing.get)

  app.get('/media/presigned-url', media.presignedUrl)
  app.use(media.proxyMiddleware)

  app.post('/ai/generate-content', ai.generateContent)
  app.post('/ai/change-content', ai.changeContent)

  Sentry.setupExpressErrorHandler(app)

  // Successful LTI resource link launch
  // @ts-expect-error @types/ltijs
  ltijs.onConnect(editor.onConnect)

  // Successful LTI deep linking launch
  // @ts-expect-error @types/ltijs
  ltijs.onDeepLinking(async (idToken, req, res) => {
    const isMoodle = idToken.iss.includes('moodle')

    // On Moodle the UX improves if we show a selection to the user. Even though there is only one option. Everywhere else we directly return without showing the selection.
    if (isMoodle) {
      await editor.selectContentType(idToken, req, res)
    } else {
      await editor.deeplinkingDone(req, res)
    }
  })

  await ltijs.deploy()

  await registerLtiPlatforms()
}

setup()
