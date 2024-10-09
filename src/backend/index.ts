import { IdToken, Provider as ltijs } from 'ltijs'
import 'dotenv/config'
import path from 'path'
import jwt from 'jsonwebtoken'
import { Pool, createPool } from 'mysql2/promise'
import { Database } from './database'
import { v4 as uuidv4 } from 'uuid'
import * as t from 'io-ts'
import { Collection, MongoClient, ObjectId } from 'mongodb'
import {
  createAutoFromResponse,
  DeeplinkLoginData,
  DeeplinkNonce,
  JwtDeepflowResponseDecoder,
  LtiCustomType,
} from './edu-sharing'
import { readEnvVariable } from './read-env-variable'
import {
  createJWKSResponse,
  signJwtWithBase64Key,
  verifyJwt,
} from '../edusharing-server/server-utils'
import { NextFunction, Request, Response } from 'express'
import { createAccessToken } from './create-acccess-token'
import {
  getEdusharingAsToolConfig,
  ltiRegisterPlatformsAndTools,
} from './lti-platforms-and-tools'
import { generateKeyPairSync } from 'crypto'
import { createInitialContent } from './create-initial-content'
import urlJoin from 'url-join'

const ltijsKey = readEnvVariable('LTIJS_KEY')
const mongodbConnectionUri = readEnvVariable('MONGODB_URI')
const mysqlUri = readEnvVariable('MYSQL_URI')

const edusharingAsToolDeploymentId = '2'

const editorUrl =
  process.env['ENVIRONMENT'] === 'local'
    ? 'http://localhost:3000/'
    : 'https://editor.serlo-staging.dev/'

const mongoUri = new URL(mongodbConnectionUri)
const mongoClient = new MongoClient(mongoUri.href)

let pool: Pool | null = null

export interface AccessToken {
  entityId: string
  accessRight: 'read' | 'write'
}

export interface Entity {
  id: number
  customClaimId: string
  content: string
  resource_link_id: string
}

// Generate keys for edusharing embed
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const keyId = uuidv4()

// Setup
ltijs.setup(
  ltijsKey,
  {
    url: mongodbConnectionUri,
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
      secure: process.env['ENVIRONMENT'] === 'local' ? false : true, // Set secure to true if the testing platform is in a different domain and https is being used
      sameSite: process.env['ENVIRONMENT'] === 'local' ? '' : 'None', // Set sameSite to 'None' if the testing platform is in a different domain and https is being used
    },
  }
)

// Disable authentication using ltik for some endpoints in edusharing embed flow.
ltijs.whitelist(
  '/platform/login',
  '/platform/done',
  '/platform/keys',
  'platform/get-'
)

// Disable COEP
ltijs.app.use((_, res, next) => {
  res.removeHeader('Cross-Origin-Embedder-Policy')
  next()
})

// Opens Serlo editor
ltijs.app.get('/app', async (_, res) => {
  return res.sendFile(path.join(__dirname, '../../dist/frontend/index.html'))
})

// Endpoint to get content
ltijs.app.get('/entity', async (req, res) => {
  const database = getMysqlDatabase()

  const accessToken = req.query.accessToken
  if (typeof accessToken !== 'string') {
    return res.send('Missing or invalid access token')
  }

  const decodedAccessToken = jwt.verify(accessToken, ltijsKey) as AccessToken

  // Get json from database with decodedAccessToken.entityId
  const entity = await database.fetchOptional<Entity | null>(
    `
      SELECT
        id,
        resource_link_id,
        custom_claim_id as customClaimId,
        content
      FROM
        lti_entity
      WHERE
        id = ?
    `,
    [String(decodedAccessToken.entityId)]
  )

  console.log('entity: ', entity)

  res.json(entity)
})

// Endpoint to save content
ltijs.app.put('/entity', async (req, res) => {
  const database = getMysqlDatabase()

  const accessToken = req.body.accessToken
  if (typeof accessToken !== 'string') {
    return res.send('Missing or invalid access token')
  }

  const decodedAccessToken = jwt.verify(accessToken, ltijsKey) as AccessToken

  if (decodedAccessToken.accessRight !== 'write') {
    return res.send('Access token grants no right to modify content')
  }

  // Modify entity with decodedAccessToken.entityId in database
  await database.mutate('UPDATE lti_entity SET content = ? WHERE id = ?', [
    req.body.editorState,
    decodedAccessToken.entityId,
  ])
  console.log(
    `Entity ${
      decodedAccessToken.entityId
    } modified in database. New state:\n${req.body.editorState}`
  )

  return res.send('Success')
})

// Provide endpoint to start embed flow on @edu-sharing
// Called when user clicks on "embed content from edusharing"
// TODO: Rename to /lti/start-edusharing-embed-flow
ltijs.app.get('/lti/start-edusharing-deeplink-flow', async (req, res, next) => {
  const idToken = res.locals.token as IdToken
  const iss = idToken.iss

  const custom: unknown = res.locals.context.custom

  const customType = t.type({
    dataToken: t.string,
    nodeId: t.string,
    user: t.string,
  })

  if (!customType.is(custom) || !custom.dataToken) {
    return next(new Error('dataToken, nodeId or user was missing in custom'))
  }

  const { user, dataToken, nodeId } = custom

  const insertResult = await edusharingEmbedSessions.insertOne({
    // createdAt: new Date(),
    user,
    dataToken,
    nodeId,
    iss,
  })
  if (!insertResult.acknowledged)
    throw new Error('Failed to add edusharing session information to mongodb')

  const edusharingAsToolConfig = getEdusharingAsToolConfig({ iss })
  if (!edusharingAsToolConfig) {
    return next(new Error(`Could not find endpoints for LTI tool ${iss}`))
  }

  // Create a Third-party Initiated Login request
  // See: https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
  createAutoFromResponse({
    res,
    method: 'GET',
    targetUrl: edusharingAsToolConfig.loginEndpoint,
    params: {
      iss: editorUrl,
      target_link_uri: edusharingAsToolConfig.launchEndpoint,
      login_hint: insertResult.insertedId.toString(),
      client_id: edusharingAsToolConfig.clientId,
      lti_deployment_id: edusharingAsToolDeploymentId,
    },
  })
})

// Receives an Authentication Request in payload
// See: https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
ltijs.app.get('/platform/login', async (req, res, next) => {
  const loginHint = req.query['login_hint']
  if (typeof loginHint !== 'string') {
    res.status(400).send('login_hint is not valid').end()
    return
  }

  const edusharingEmbedSessionId = parseObjectId(loginHint)

  if (edusharingEmbedSessionId == null) {
    res.status(400).send('login_hint is not valid').end()
    return
  }

  const result = await edusharingEmbedSessions.findOneAndDelete({
    _id: edusharingEmbedSessionId,
  })
  if (!result) {
    res.status(400).send('could not find edusharingEmbedSession').end()
    return
  }

  const { value: edusharingEmbedSession } = result

  if (
    !t
      .type({
        user: t.string,
        nodeId: t.string,
        dataToken: t.string,
        iss: t.string,
      })
      .is(edusharingEmbedSession)
  ) {
    res.status(400).send('login_hint is invalid or session is expired').end()
    return
  }

  const { user, nodeId, dataToken, iss } = edusharingEmbedSession

  const edusharingAsToolConfig = getEdusharingAsToolConfig({ iss })
  if (!edusharingAsToolConfig) {
    return next(new Error(`Could not find endpoints for LTI tool ${iss}`))
  }

  const nonce = req.query['nonce']
  const state = req.query['state']

  if (typeof nonce !== 'string') {
    res.status(400).send('nonce is not valid').end()
    return
  } else if (typeof state !== 'string') {
    res.status(400).send('state is not valid').end()
    return
  } else if (
    req.query['redirect_uri'] !== edusharingAsToolConfig.launchEndpoint
  ) {
    res.status(400).send('redirect_uri is not valid').end()
    return
  } else if (req.query['client_id'] !== 'editor') {
    res.status(400).send('client_id is not valid').end()
    return
  }

  const nonceId = await deeplinkNonces.insertOne({
    createdAt: new Date(),
    nonce,
  })

  const platformDoneEndpoint = new URL('/platform/done', editorUrl)

  // Construct a Authentication Response
  // See: https://www.imsglobal.org/spec/security/v1p0/#step-3-authentication-response
  // An id token is sent back containing a LTI Deep Linking Request Message.
  // See: https://www.imsglobal.org/spec/lti-dl/v2p0#dfn-deep-linking-request-message
  // See https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-request-example
  // for an example of a deep linking request payload
  const payload = {
    iss: editorUrl,

    // TODO: This should be a list. Fix this when edusharing has fixed the
    // parsing of the JWT.
    aud: edusharingAsToolConfig.clientId,
    sub: user,

    nonce,
    dataToken,

    'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
      edusharingAsToolDeploymentId,
    'https://purl.imsglobal.org/spec/lti/claim/message_type':
      'LtiDeepLinkingRequest',
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/roles': [],
    'https://purl.imsglobal.org/spec/lti/claim/context': { id: nodeId },
    'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': {
      accept_types: ['ltiResourceLink'],
      accept_presentation_document_targets: ['iframe'],
      accept_multiple: true,
      auto_create: false,
      deep_link_return_url: platformDoneEndpoint,
      title: '',
      text: '',
      data: nonceId.insertedId.toString(),
    },
  }

  const token = signJwtWithBase64Key({
    payload,
    keyid: keyId,
    privateKey: privateKey,
  })

  createAutoFromResponse({
    res,
    method: 'POST',
    targetUrl: edusharingAsToolConfig.launchEndpoint,
    params: { id_token: token, state },
  })
})

ltijs.app.use('/platform/keys', async (_req, res) => {
  createJWKSResponse({
    res,
    keyid: keyId,
    publicKey: publicKey,
  })
})

// Called after the resource selection on Edusharing (within iframe) when user selected what resource to embed.
// Receives a LTI Deep Linking Response Message in payload. Contains content_items array that specifies which resource should be embedded.
// See: https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-message
// See https://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-example for an example response payload
ltijs.app.post('/platform/done', async (req, res, next) => {
  // const idToken = res.locals.token
  // const { iss } = idToken
  if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') {
    res
      .status(400)
      .send('"content-type" is not "application/x-www-form-urlencoded"')
      .end()
    return
  }

  if (typeof req.body.JWT !== 'string') {
    res.status(400).send('JWT token is missing in the request').end()
    return
  }

  const { iss } = jwt.decode(req.body.JWT) as { iss: string }

  const edusharingAsToolConfig = getEdusharingAsToolConfig({ clientId: iss })
  if (!edusharingAsToolConfig) {
    return next(new Error(`Could not find endpoints for LTI tool ${iss}`))
  }
  const verifyResult = await verifyJwt({
    token: req.body.JWT,
    keysetUrl: edusharingAsToolConfig.keysetEndpoint,
    verifyOptions: {
      issuer: edusharingAsToolConfig.clientId,
      audience: editorUrl,
    },
  })

  if (verifyResult.success === false) {
    res.status(verifyResult.status).send(verifyResult.error)
    return
  }

  const { decoded } = verifyResult
  const data = decoded['https://purl.imsglobal.org/spec/lti-dl/claim/data']

  if (typeof data !== 'string') {
    res.status(400).send('data claim in JWT is missing').end()
    return
  }

  const nonceId = parseObjectId(data)

  if (nonceId == null) {
    res.status(400).send('data claim in JWT is invalid').end()
    return
  }

  const result = await deeplinkNonces.findOneAndDelete({
    _id: nonceId,
  })
  if (!result.ok) {
    res.status(400).send('No entry found in deeplinkNonces').end()
    return
  }

  const deeplinkNonce = result.value

  if (!DeeplinkNonce.is(deeplinkNonce)) {
    res.status(400).send('deeplink flow session expired').end()
    return
  }

  if (decoded.nonce !== deeplinkNonce.nonce) {
    res.status(400).send('nonce is invalid').end()
    return
  }

  if (!JwtDeepflowResponseDecoder.is(decoded)) {
    res.status(400).send('malformed custom claim in JWT send').end()
    return
  }

  const { repositoryId, nodeId } =
    decoded['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'][0]
      .custom

  res
    .setHeader('Content-type', 'text/html')
    .send(
      `<!DOCTYPE html>
            <html>
              <body>
                <script type="text/javascript">
                  parent.postMessage({
                    repositoryId: '${repositoryId}',
                    nodeId: '${nodeId}'
                  }, '${editorUrl}')
                </script>
              </body>
            </html>
          `
    )
    .end()
})

ltijs.app.get('/lti/get-embed-html', async (req, res, next) => {
  const idToken = res.locals.token
  const { iss } = idToken
  const edusharingAsToolConfig = getEdusharingAsToolConfig({ iss })
  if (!edusharingAsToolConfig) {
    return next(new Error(`Could not find endpoints for LTI tool ${iss}`))
  }

  const custom: unknown = res.locals.context.custom

  if (!t.type({ dataToken: t.string }).is(custom)) {
    res.json({
      detailsSnippet: `<b>The LTI claim https://purl.imsglobal.org/spec/lti/claim/custom was invalid during request to endpoint ${req.path}</b>`,
    })
    return
  }

  // TODO: Check
  const nodeId = req.query['nodeId']
  const repositoryId = req.query['repositoryId']

  const payload = {
    aud: edusharingAsToolConfig.clientId,
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
      edusharingAsToolDeploymentId,
    expiresIn: 60,
    dataToken: custom.dataToken,
    'https://purl.imsglobal.org/spec/lti/claim/context': {
      id: edusharingAsToolConfig.clientId,
    },
  }

  const message = signJwtWithBase64Key({
    payload,
    keyid: keyId,
    privateKey: privateKey,
  })

  const url = new URL(
    urlJoin(edusharingAsToolConfig.detailsEndpoint, `${repositoryId}/${nodeId}`)
  )

  url.searchParams.append('displayMode', 'inline')
  url.searchParams.append('jwt', encodeURIComponent(message))

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (response.status != 200) {
    res.json({
      responseStatus: response.status,
      responseText: await response.text(),
      detailsSnippet:
        '<b>Es ist ein Fehler aufgetreten, den edu-sharing Inhalt einzubinden. Bitte wenden Sie sich an den Systemadministrator.</b>',
      characterEncoding: response.headers.get('content-type'),
    })
  } else {
    res.json(await response.json())
  }
})

// Successful LTI resource link launch
// @ts-expect-error @types/ltijs
ltijs.onConnect(async (idToken, req, res, next) => {
  if (
    idToken.iss ===
      'https://repository.staging.cloud.schulcampus-rlp.de/edu-sharing' ||
    idToken.iss === 'http://localhost:8100/edu-sharing'
  ) {
    await onConnectEdusharing(idToken, req, res, next)
  } else {
    onConnectDefault(idToken, req, res, next)
  }
}, {})

async function onConnectEdusharing(
  idToken: IdToken,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // @ts-expect-error @types/ltijs
  const resourceLinkId: string = idToken.platformContext.resource.id
  // @ts-expect-error @types/ltijs
  const custom: unknown = idToken.platformContext.custom

  if (!LtiCustomType.is(custom)) {
    return next(
      new Error(
        `Unexpected type of LTI 'custom' claim. Got ${JSON.stringify(custom)}`
      )
    )
  }

  const entityId = await getEntityId(custom.nodeId)
  async function getEntityId(edusharingNodeId: string) {
    const mysqlDatabase = getMysqlDatabase()
    // Check if there is already a database entry with edusharing_node_id
    const existingEntity = await mysqlDatabase.fetchOptional<Entity | null>(
      `
      SELECT
          id
          FROM
          lti_entity
        WHERE
        edusharing_node_id = ?
        `,
      [String(edusharingNodeId)]
    )
    if (existingEntity) {
      return existingEntity.id
    }
    // If there is no existing entity, create one
    const insertedEntity = await mysqlDatabase.mutate(
      'INSERT INTO lti_entity (edusharing_node_id, content, id_token_on_creation, resource_link_id) values (?, ?, ?, ?)',
      [
        edusharingNodeId,
        JSON.stringify(createInitialContent()),
        JSON.stringify(idToken),
        resourceLinkId,
      ]
    )
    return insertedEntity.insertId
  }

  const editorMode =
    typeof custom.postContentApiUrl === 'string' ? 'write' : 'read'
  const accessToken = createAccessToken(editorMode, entityId, ltijsKey)

  const searchParams = new URLSearchParams()
  searchParams.append('accessToken', accessToken)
  searchParams.append('resourceLinkId', resourceLinkId)
  searchParams.append('ltik', res.locals.ltik)
  searchParams.append(
    'testingSecret',
    readEnvVariable('SERLO_EDITOR_TESTING_SECRET')
  )

  return ltijs.redirect(res, `/app?${searchParams}`)
}

async function onConnectDefault(
  idToken: IdToken,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Get customId from lti custom claim or alternatively search query parameters
  // Using search query params is suggested by ltijs, see: https://github.com/Cvmcosta/ltijs/issues/100#issuecomment-832284300
  // @ts-expect-error @types/ltijs
  const customId = idToken.platformContext.custom.id ?? req.query.id
  if (!customId) return res.send('Missing customId!')

  // @ts-expect-error @types/ltijs
  const resourceLinkId: string = idToken.platformContext.resource.id

  console.log('ltijs.onConnect -> idToken: ', idToken)

  const mysqlDatabase = getMysqlDatabase()

  // Future: Might need to fetch multiple once we create new entries with the same custom_claim_id
  const entity = await mysqlDatabase.fetchOptional<Entity | null>(
    `
      SELECT
        id,
        resource_link_id,
        custom_claim_id as customClaimId,
        content
      FROM
        lti_entity
      WHERE
        custom_claim_id = ?
    `,
    [String(customId)]
  )

  if (!entity) {
    res.send('<div>Dieser Inhalt wurde nicht gefunden.</div>')
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
  // @ts-expect-error @types/ltijs
  const courseMembershipRole = idToken.platformContext.roles?.find((role) =>
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
    await mysqlDatabase.mutate(
      'UPDATE lti_entity SET resource_link_id = ? WHERE id = ?',
      [resourceLinkId, entity.id]
    )
  }

  const searchParams = new URLSearchParams()
  searchParams.append('accessToken', accessToken)
  searchParams.append('resourceLinkId', resourceLinkId)
  searchParams.append(
    'testingSecret',
    readEnvVariable('SERLO_EDITOR_TESTING_SECRET')
  )

  return ltijs.redirect(res, `/app?${searchParams}`)
}

// Successful LTI deep linking launch
// @ts-expect-error @types/ltijs
ltijs.onDeepLinking(async (idToken, __, res) => {
  const mysqlDatabase = getMysqlDatabase()

  const isLocalEnvironment = process.env['ENVIRONMENT'] === 'local'

  const ltiCustomClaimId = uuidv4()

  // Create new entity in database
  const { insertId: entityId } = await mysqlDatabase.mutate(
    'INSERT INTO lti_entity (custom_claim_id, content, id_token_on_creation) values (?, ?, ?)',
    [
      ltiCustomClaimId,
      JSON.stringify(createInitialContent()),
      JSON.stringify(idToken),
    ]
  )

  console.log('entityId: ', entityId)

  const url = new URL(
    isLocalEnvironment
      ? 'http://localhost:3000'
      : 'https://editor.serlo-staging.dev'
  )
  url.pathname = '/lti/launch'
  // https://www.imsglobal.org/spec/lti-dl/v2p0#lti-resource-link
  const items = [
    {
      type: 'ltiResourceLink',
      url: url.href,
      title: `Serlo Editor Content`,
      text: 'Placeholder description',
      // icon:
      // thumbnail:
      // window:
      // iframe: {
      //   width: 400,
      //   height: 300,
      // },
      custom: {
        // Important: Only use lowercase letters in key. When I used uppercase letters they were changed to lowercase letters in the LTI Resource Link launch.
        id: ltiCustomClaimId,
      },
      // lineItem:
      // available:
      // submission:

      // Custom properties
      // presentation: {
      //   documentTarget: "iframe",
      // },
    },
  ]

  // Creates the deep linking request form
  const form = await ltijs.DeepLinking.createDeepLinkingForm(idToken, items, {})

  return res.send(form)
})

// TODO: Rename to edusharingEmbed...
let deeplinkNonces: Collection
let edusharingEmbedSessions: Collection

// Setup function
const setup = async () => {
  await ltijs.deploy()
  await mongoClient.connect()

  deeplinkNonces = mongoClient.db().collection('deeplink_nonce')
  edusharingEmbedSessions = mongoClient
    .db()
    .collection('edusharing_embed_session')

  // const sevenDaysInSeconds = 604800
  // await deeplinkNonces.createIndex(
  //   { createdAt: 1 },
  //   // The nonce is generated and stored in the database when the user clicks "embed content from edu sharing". It needs to stay valid until the user selects & embeds a content from edu-sharing within the iframe. But it should not exist indefinitely and the database should be cleared from old nonce values at some point. So we make them expire after 7 days.
  //   // https://www.mongodb.com/docs/manual/tutorial/expire-data/
  //   { expireAfterSeconds: sevenDaysInSeconds }
  // )
  // await edusharingEmbedSession.createIndex(
  //   { createdAt: 1 },
  //   // Since edusharing should directly redirect the user to our page a small
  //   // max age should be fine her
  //   { expireAfterSeconds: 20 }
  // )

  // If you encounter error message `bad decrypt` or changed the ltijs encryption key this might help. See: https://github.com/Cvmcosta/ltijs/issues/119#issuecomment-882898770
  // const platforms = await ltijs.getAllPlatforms()
  // if (platforms) {
  //   for (const platform of platforms) {
  //     // @ts-expect-error @types/ltijs is missing this
  //     await platform.delete()
  //   }
  // }

  await ltiRegisterPlatformsAndTools()

  const database = getMysqlDatabase()
  await database.mutate(
    `
    CREATE TABLE IF NOT EXISTS lti_entity (
      id bigint NOT NULL AUTO_INCREMENT, 
      resource_link_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, 
      custom_claim_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
      edusharing_node_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, 
      content longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL, 
      id_token_on_creation text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL, 
      
      PRIMARY KEY (id), KEY idx_lti_entity_custom_claim_id (custom_claim_id) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
    `
  )

  if (process.env['ENVIRONMENT'] === 'local') {
    // Make sure there is an entity with a fixed ID in database to simplify local development

    const entity = await database.fetchOptional<Entity | null>(
      `
      SELECT
        id,
        resource_link_id,
        custom_claim_id as customClaimId,
        content
      FROM
        lti_entity
      WHERE
        custom_claim_id = ?
    `,
      ['00000000-0000-0000-0000-000000000000']
    )
    if (!entity) {
      await database.mutate(
        'INSERT INTO lti_entity (custom_claim_id, content, id_token_on_creation) values (?, ?, ?)',
        [
          '00000000-0000-0000-0000-000000000000',
          JSON.stringify(createInitialContent()),
          JSON.stringify({}),
        ]
      )
    }
  }
}

setup()

function getMysqlDatabase() {
  if (pool === null) {
    pool = createPool(mysqlUri)
  }
  return new Database(pool)
}

// TODO: Understand
function parseObjectId(objectId: string): ObjectId | null {
  try {
    return new ObjectId(objectId)
  } catch {
    return null
  }
}
