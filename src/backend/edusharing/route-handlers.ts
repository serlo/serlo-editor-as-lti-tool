import jwt from 'jsonwebtoken'
import * as t from 'io-ts'
import urlJoin from 'url-join'
import { createAutoFormResponse } from '../util/create-auto-form-response'
import {
  verifyJwt,
  signJwtWithBase64Key,
  edusharingEmbedKeys,
} from './jwt-helpers'
import { Collection, MongoClient, ObjectId } from 'mongodb'

import { NextFunction, Request, Response } from 'express'
import { getEdusharingAsToolConfiguration } from './edusharing-as-tool-configuration'
import config from '../../utils/config'
import { IdToken } from '../types/idtoken'
import { createAndLogError } from '../../utils/logger'
import { EdusharingLtiCustomClaimType } from '../types/edu-sharing-lti-custom-claim'

const editorUrl = config.EDITOR_URL

const edusharingAsToolDeploymentId = '1'

const mongodbConnectionUri = config.MONGODB_URI
const mongoUri = new URL(mongodbConnectionUri)
const mongoClient = new MongoClient(mongoUri.href)

let edusharingEmbedNonces: Collection
let edusharingEmbedSessions: Collection

export async function init() {
  await mongoClient.connect()

  edusharingEmbedNonces = mongoClient.db().collection('edusharing_embed_nonce')
  edusharingEmbedSessions = mongoClient
    .db()
    .collection('edusharing_embed_session')

  const sevenDaysInSeconds = 604800
  await edusharingEmbedNonces.createIndex(
    { createdAt: 1 },
    // The nonce is generated and stored in the database when the user clicks "embed content from edu sharing". It needs to stay valid until the user selects & embeds a content from edu-sharing within the iframe. But it should not exist indefinitely and the database should be cleared from old nonce values at some point. So we make them expire after 7 days.
    // https://www.mongodb.com/docs/manual/tutorial/expire-data/
    { expireAfterSeconds: sevenDaysInSeconds }
  )
  await edusharingEmbedSessions.createIndex(
    { createdAt: 1 },
    // Since edusharing should directly redirect the user to our page a small
    // max age should be fine her
    { expireAfterSeconds: 20 }
  )
}

export async function start(_: Request, res: Response, next: NextFunction) {
  try {
    const idToken = res.locals.token as unknown as IdToken
    const issWhenEdusharingLaunchedSerloEditor = idToken.iss

    const custom: unknown = res.locals.context?.custom

    if (!EdusharingLtiCustomClaimType.is(custom))
      throw createAndLogError(
        `edu-sharing LTI custom claim malformed. Was: ${JSON.stringify(custom)}`
      )

    const { user, dataToken, nodeId } = custom

    const insertResult = await edusharingEmbedSessions.insertOne({
      createdAt: new Date(),
      user,
      dataToken,
      nodeId,
      iss: issWhenEdusharingLaunchedSerloEditor,
    })
    if (!insertResult.acknowledged)
      throw createAndLogError(
        'Failed to add edu-sharing session information to mongodb'
      )

    const edusharingAsToolConfiguration = getEdusharingAsToolConfiguration({
      issWhenEdusharingLaunchedSerloEditor,
    })
    if (!edusharingAsToolConfiguration)
      throw createAndLogError(
        `Could not find edu-sharing endpoints for iss ${issWhenEdusharingLaunchedSerloEditor} during edu-sharing embed flow`
      )

    // Create a Third-party Initiated Login request
    // See: https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
    createAutoFormResponse({
      res,
      method: 'GET',
      targetUrl: edusharingAsToolConfiguration.loginEndpoint,
      params: {
        iss: editorUrl,
        target_link_uri: edusharingAsToolConfiguration.launchEndpoint,
        login_hint: insertResult.insertedId.toString(),
        client_id: edusharingAsToolConfiguration.clientId,
        lti_deployment_id: edusharingAsToolDeploymentId,
      },
    })
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const loginHint = req.query['login_hint']
    if (typeof loginHint !== 'string')
      throw createAndLogError(
        'login_hint is not valid during edu-sharing embed flow'
      )

    const edusharingEmbedSessionId = parseObjectId(loginHint)

    if (edusharingEmbedSessionId == null)
      throw createAndLogError(
        'login_hint is not valid during edu-sharing embed flow'
      )

    const findResult = await edusharingEmbedSessions.findOneAndDelete({
      _id: edusharingEmbedSessionId,
    })
    if (!findResult)
      throw createAndLogError(
        'could not find edusharingEmbedSession during edu-sharing embed flow'
      )

    if (
      !t
        .type({
          user: t.string,
          nodeId: t.string,
          dataToken: t.string,
          iss: t.string,
        })
        .is(findResult)
    )
      throw createAndLogError(
        'login_hint is invalid or session is expired during edu-sharing embed flow'
      )

    const { user, nodeId, dataToken, iss } = findResult

    const edusharingAsToolConfig = getEdusharingAsToolConfiguration({
      issWhenEdusharingLaunchedSerloEditor: iss,
    })
    if (!edusharingAsToolConfig)
      throw createAndLogError(`Could not find endpoints for LTI tool ${iss}`)

    const nonce = req.query['nonce']
    const state = req.query['state']

    if (typeof nonce !== 'string')
      throw createAndLogError(
        'nonce is not valid during edu-sharing embed flow'
      )
    if (typeof state !== 'string')
      throw createAndLogError(
        'state is not valid during edu-sharing embed flow'
      )
    if (req.query['redirect_uri'] !== edusharingAsToolConfig.launchEndpoint)
      throw createAndLogError(
        'redirect_uri is not valid during edu-sharing embed flow'
      )
    if (req.query['client_id'] !== edusharingAsToolConfig.clientId)
      throw createAndLogError(
        'client_id is not valid during edu-sharing embed flow'
      )

    const insertResult = await edusharingEmbedNonces.insertOne({
      createdAt: new Date(),
      nonce,
    })

    if (!insertResult.acknowledged)
      throw createAndLogError(
        'Failed to add edu-sharing nonce to mongodb during edu-sharing embed flow'
      )

    const platformDoneEndpoint = new URL(
      urlJoin(editorUrl, '/edusharing-embed/done')
    )

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
        data: insertResult.insertedId.toString(),
      },
    }

    const token = signJwtWithBase64Key(payload)

    createAutoFormResponse({
      res,
      method: 'POST',
      targetUrl: edusharingAsToolConfig.launchEndpoint,
      params: { id_token: token, state },
    })
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}
export function keys(_: Request, res: Response) {
  res.json({
    keys: [
      {
        kid: edusharingEmbedKeys.keyId,
        alg: 'RS256',
        use: 'sig',
        ...edusharingEmbedKeys.publicKey.export({ format: 'jwk' }),
      },
    ],
  })
}
export async function done(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.headers['content-type'] !== 'application/x-www-form-urlencoded')
      throw createAndLogError(
        '"content-type" is not "application/x-www-form-urlencoded" during edu-sharing embed flow'
      )

    if (typeof req.body.JWT !== 'string')
      throw createAndLogError(
        'JWT token is missing in the request during edu-sharing embed flow'
      )

    const decodedJwt = jwt.decode(req.body.JWT)

    if (!t.type({ iss: t.string }).is(decodedJwt))
      throw createAndLogError('Failed to decode jwt')

    const edusharingClientIdOnSerloEditor = decodedJwt.iss

    const edusharingAsToolConfig = getEdusharingAsToolConfiguration({
      edusharingClientIdOnSerloEditor,
    })
    if (!edusharingAsToolConfig)
      throw createAndLogError(
        `Could not find endpoints for LTI tool ${edusharingClientIdOnSerloEditor}`
      )
    const verifyResult = await verifyJwt({
      token: req.body.JWT,
      keysetUrl: edusharingAsToolConfig.keysetEndpoint,
      verifyOptions: {
        issuer: edusharingAsToolConfig.clientId,
        audience: editorUrl,
      },
    })

    if (verifyResult.success === false)
      throw createAndLogError(
        'Verifying JWT failed during edu-sharing embed flow'
      )

    const { decoded } = verifyResult
    const data = decoded['https://purl.imsglobal.org/spec/lti-dl/claim/data']

    if (typeof data !== 'string')
      throw createAndLogError(
        'data claim in JWT is missing during edu-sharing embed flow'
      )

    const nonceId = parseObjectId(data)

    if (nonceId == null)
      throw createAndLogError(
        'data claim in JWT is invalid during edu-sharing embed flow'
      )

    const findResult = await edusharingEmbedNonces.findOneAndDelete({
      _id: nonceId,
    })
    if (!findResult)
      throw createAndLogError(
        'No entry found in deeplinkNonces during edu-sharing embed flow'
      )

    if (!t.type({ nonce: t.string }).is(findResult))
      throw createAndLogError(
        'deeplink flow session expired during edu-sharing embed flow'
      )

    if (decoded.nonce !== findResult.nonce)
      throw createAndLogError('nonce is invalid during edu-sharing embed flow')

    const expectedJwtType = t.type({
      'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': t.array(
        t.type({
          custom: t.type({
            nodeId: t.string,
            repositoryId: t.string,
          }),
        })
      ),
    })
    if (!expectedJwtType.is(decoded))
      throw createAndLogError(
        'malformed custom claim in JWT send during edu-sharing embed flow'
      )

    const { repositoryId, nodeId } =
      decoded['https://purl.imsglobal.org/spec/lti-dl/claim/content_items'][0]
        .custom

    res.setHeader('Content-type', 'text/html').send(
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
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}
export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const idToken = res.locals.token
    if (!idToken)
      throw createAndLogError(
        'Missing idToken while trying to fetch edu-sharing embed'
      )
    const { iss } = idToken
    const edusharingAsToolConfig = getEdusharingAsToolConfiguration({
      issWhenEdusharingLaunchedSerloEditor: iss,
    })
    if (!edusharingAsToolConfig)
      throw createAndLogError(
        'Failed to get edu-sharing endpoints while trying to fetch edu-sharing embed'
      )

    const custom: unknown = res.locals.context?.custom

    if (!t.type({ dataToken: t.string }).is(custom))
      throw createAndLogError(
        'LTI custom claim malformed while trying to fetch edu-sharing embed'
      )

    const nodeId = req.query['nodeId']
    const repositoryId = req.query['repositoryId']
    if (!nodeId || !repositoryId)
      throw createAndLogError(
        'nodeId or repositoryId missing while trying to fetch edu-sharing embed'
      )

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

    const message = signJwtWithBase64Key(payload)

    const url = new URL(
      urlJoin(
        edusharingAsToolConfig.detailsEndpoint,
        `${repositoryId}/${nodeId}`
      )
    )

    url.searchParams.append('displayMode', 'inline')
    url.searchParams.append('jwt', encodeURIComponent(message))

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })

    if (response.status != 200)
      throw createAndLogError('Failed to fetch edu-sharing embed')

    res.json(await response.json())
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}

function parseObjectId(objectId: string): ObjectId | null {
  try {
    return new ObjectId(objectId)
  } catch {
    return null
  }
}
