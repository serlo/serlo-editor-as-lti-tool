import './util/sentry.js'
import { Provider as ltijs } from 'ltijs'
import path from 'path'

import * as t from 'io-ts'
import * as Sentry from '@sentry/node'
import { NextFunction, Request, Response } from 'express'
import { createAccessToken } from './util/create-acccess-token'
import { registerLtiPlatforms } from './util/register-lti-platforms'
import config from '../utils/config'
import * as edusharing from './edusharing'
import * as editor from './editor-route-handlers'
import * as ai from './ai-route-handlers'
import { getMariaDB } from './mariadb'
import * as media from './media-route-handlers'
import { logger } from '../utils/logger'
import { IdToken } from './types/idtoken'
import { errorMessageToUser } from './error-message-to-user'

const ltijsKey = config.LTIJS_KEY

export interface AccessToken {
  entityId: string
  accessRight: 'read' | 'write'
}

export interface Entity {
  id: number
  custom_claim_id?: string
  content: string
  resource_link_id: string
  edusharing_node_id?: string
  id_token_on_creation: string
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
  ltijs.onConnect((idToken, req, res) => {
    if (idToken.iss.includes('edu-sharing')) {
      void onConnectEdusharing(idToken as unknown as IdToken, req, res)
    } else {
      void onConnectDefault(idToken as unknown as IdToken, req, res)
    }
  }, {})

  async function onConnectEdusharing(
    idToken: IdToken,
    _: Request,
    res: Response
  ) {
    const custom: unknown = idToken.platformContext?.custom
    const expectedCustomType = t.intersection([
      t.type({
        getContentApiUrl: t.string,
        appId: t.string,
        dataToken: t.string,
        nodeId: t.string,
        user: t.string,
      }),
      t.partial({
        fileName: t.string,
        /** Is set when editor was opened in edit mode */
        postContentApiUrl: t.string,
        version: t.string,
      }),
    ])
    if (!expectedCustomType.is(custom)) {
      res
        .status(400)
        .send(
          errorMessageToUser(
            `Unexpected type of LTI 'custom' claim. Got ${JSON.stringify(custom)}`
          )
        )
      return
    }

    const resourceLinkId = idToken.platformContext?.resource?.id
    if (!resourceLinkId) {
      res.status(400).send(errorMessageToUser('resource link id missing'))
      return
    }

    const edusharingNodeId = custom.nodeId

    const entityId = await getEntityId()
    async function getEntityId() {
      const mariaDB = getMariaDB()
      // Check if there is already a database entry with resource_link_id
      const existingEntity = await mariaDB.fetchOptional<Entity | null>(
        'SELECT id FROM lti_entity WHERE resource_link_id = ?',
        [resourceLinkId]
      )
      if (existingEntity) {
        return existingEntity.id
      }
      // If there is no existing entity, create one
      const insertedEntity = await mariaDB.mutate(
        'INSERT INTO lti_entity (edusharing_node_id, id_token_on_creation, resource_link_id) values (?, ?, ?)',
        [edusharingNodeId, JSON.stringify(idToken), resourceLinkId]
      )
      return insertedEntity.insertId
    }

    const editorMode =
      typeof custom.postContentApiUrl === 'string' ? 'write' : 'read'
    const accessToken = createAccessToken(editorMode, entityId, ltijsKey)

    const ltik = res.locals.ltik
    const title = idToken.platformContext?.resource?.title
    const contextTitle = idToken.platformContext?.context?.title

    const searchParams = createSearchParams({
      ltik,
      accessToken,
      resourceLinkId,
      title,
      contextTitle,
    })

    return ltijs.redirect(res, `/app?${searchParams.toString()}`)
  }

  async function onConnectDefault(idToken: IdToken, _: Request, res: Response) {
    const customId = idToken.platformContext?.custom?.id
    if (!customId) {
      res.status(400).send(errorMessageToUser('custom id missing'))
      return
    }

    const resourceLinkId = idToken.platformContext?.resource?.id
    if (!resourceLinkId) {
      res.status(400).send(errorMessageToUser('resource link id missing'))
      return
    }

    logger.info('ltijs.onConnect -> idToken: ', idToken)

    const mariaDB = getMariaDB()

    // Future: Might need to fetch multiple once we create new entries with the same custom_claim_id
    const entity = await mariaDB.fetchOptional<Entity | null>(
      `
      SELECT
        id,
        resource_link_id,
        custom_claim_id,
        content
      FROM
        lti_entity
      WHERE
        custom_claim_id = ?
    `,
      [String(customId)]
    )

    if (!entity) {
      res.send(errorMessageToUser('Content not found in database'))
      return
    }

    // https://www.imsglobal.org/spec/lti/v1p3#lis-vocabulary-for-context-roles
    // Example roles claim from itslearning
    // "https://purl.imsglobal.org/spec/lti/claim/roles":[
    //   0:"http://purl.imsglobal.org/vocab/lis/v2/institution/person#Staff"
    //   1:"http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"
    // ]
    const rolesWithWriteAccess = [
      'membership#Administrator',
      'membership#ContentDeveloper',
      'membership#Instructor',
      'membership#Mentor',
      'membership#Manager',
      'membership#Officer',
      // This role is sent in the itslearning library and we disallow editing there for now
      // 'membership#Member',
    ]
    const courseMembershipRole = idToken.platformContext?.roles?.find((role) =>
      role.includes('membership#')
    )
    const editorMode =
      courseMembershipRole &&
      rolesWithWriteAccess.some((roleWithWriteAccess) =>
        courseMembershipRole.includes(roleWithWriteAccess)
      )
        ? 'write'
        : 'read'

    const accessToken = createAccessToken(editorMode, entity.id, ltijsKey)

    if (!entity.resource_link_id) {
      // Set resource_link_id in database
      await mariaDB.mutate(
        'UPDATE lti_entity SET resource_link_id = ? WHERE id = ?',
        [resourceLinkId, entity.id]
      )
    }

    const ltik = res.locals.ltik
    const title = idToken.platformContext?.resource?.title
    const contextTitle = idToken.platformContext?.context?.title

    const searchParams = createSearchParams({
      ltik,
      accessToken,
      resourceLinkId,
      contextTitle,
      title,
    })

    return ltijs.redirect(res, `/app?${searchParams.toString()}`)
  }

  function createSearchParams({
    ltik,
    accessToken,
    resourceLinkId,
    contextTitle,
    title,
  }: {
    ltik: string
    accessToken: string
    resourceLinkId: string
    contextTitle?: string
    title?: string
  }) {
    const searchParams = new URLSearchParams()
    searchParams.append('accessToken', accessToken)
    searchParams.append('resourceLinkId', resourceLinkId)
    searchParams.append('testingSecret', config.SERLO_EDITOR_TESTING_SECRET)
    searchParams.append('ltik', ltik)
    searchParams.append('contextTitle', contextTitle ?? '')
    searchParams.append('title', title ?? '')

    return searchParams
  }

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
