import { IdToken } from 'ltijs'
import jwt from 'jsonwebtoken'
import * as t from 'io-ts'
import { readEnvVariable } from '../read-env-variable'
import urlJoin from 'url-join'
import { createAutoFormResponse } from '../util/create-auto-form-response'
import { verifyJwt } from './verify-jwt'
import { createJWKSResponse } from './create-jwks-response'
import { signJwtWithBase64Key } from './sign-jwt'
import { edusharingEmbedKeys } from './edusharing-embed-keys'
import { Collection, MongoClient, ObjectId } from 'mongodb'

import { Request, Response } from 'express'
import { getEdusharingAsToolConfiguration } from './get-edusharing-as-tool-configuration'

const editorUrl = readEnvVariable('EDITOR_URL')

const edusharingAsToolDeploymentId = '1'

const mongodbConnectionUri = readEnvVariable('MONGODB_URI')
const mongoUri = new URL(mongodbConnectionUri)
const mongoClient = new MongoClient(mongoUri.href)

let edusharingEmbedNonces: Collection
let edusharingEmbedSessions: Collection

export async function edusharingInit() {
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

export async function edusharingStart(_: Request, res: Response) {
  const idToken = res.locals.token as IdToken
  const issWhenEdusharingLaunchedSerloEditor = idToken.iss

  const custom: unknown = res.locals.context?.custom

  const customType = t.type({
    dataToken: t.string,
    nodeId: t.string,
    user: t.string,
  })

  if (!customType.is(custom) || !custom.dataToken) {
    res.status(400).send('dataToken, nodeId or user was missing in custom')
    return
  }

  const { user, dataToken, nodeId } = custom

  const insertResult = await edusharingEmbedSessions.insertOne({
    createdAt: new Date(),
    user,
    dataToken,
    nodeId,
    iss: issWhenEdusharingLaunchedSerloEditor,
  })
  if (!insertResult.acknowledged) {
    res
      .status(400)
      .send('Failed to add edusharing session information to mongodb')
    return
  }

  const edusharingAsToolConfiguration = getEdusharingAsToolConfiguration({
    issWhenEdusharingLaunchedSerloEditor,
  })
  if (!edusharingAsToolConfiguration) {
    res
      .status(400)
      .send(
        `Could not find endpoints for iss ${issWhenEdusharingLaunchedSerloEditor}`
      )
    return
  }

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
}

export async function edusharingLogin(req: Request, res: Response) {
  const loginHint = req.query['login_hint']
  if (typeof loginHint !== 'string') {
    res.status(400).send('login_hint is not valid')
    return
  }

  const edusharingEmbedSessionId = parseObjectId(loginHint)

  if (edusharingEmbedSessionId == null) {
    res.status(400).send('login_hint is not valid')
    return
  }

  const findResult = await edusharingEmbedSessions.findOneAndDelete({
    _id: edusharingEmbedSessionId,
  })
  if (!findResult) {
    res.status(400).send('could not find edusharingEmbedSession')
    return
  }

  const { value: edusharingEmbedSession } = findResult

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
    res.status(400).send('login_hint is invalid or session is expired')
    return
  }

  const { user, nodeId, dataToken, iss } = edusharingEmbedSession

  const edusharingAsToolConfig = getEdusharingAsToolConfiguration({
    issWhenEdusharingLaunchedSerloEditor: iss,
  })
  if (!edusharingAsToolConfig) {
    res.status(400).send(`Could not find endpoints for LTI tool ${iss}`)
    return
  }

  const nonce = req.query['nonce']
  const state = req.query['state']

  if (typeof nonce !== 'string') {
    res.status(400).send('nonce is not valid')
    return
  } else if (typeof state !== 'string') {
    res.status(400).send('state is not valid')
    return
  } else if (
    req.query['redirect_uri'] !== edusharingAsToolConfig.launchEndpoint
  ) {
    res.status(400).send('redirect_uri is not valid')
    return
  } else if (req.query['client_id'] !== edusharingAsToolConfig.clientId) {
    res.status(400).send('client_id is not valid')
    return
  }

  const insertResult = await edusharingEmbedNonces.insertOne({
    createdAt: new Date(),
    nonce,
  })

  const platformDoneEndpoint = new URL(urlJoin(editorUrl, '/done'))

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

  const token = signJwtWithBase64Key({
    payload,
    keyid: edusharingEmbedKeys.keyId,
    privateKey: edusharingEmbedKeys.privateKey,
  })

  createAutoFormResponse({
    res,
    method: 'POST',
    targetUrl: edusharingAsToolConfig.launchEndpoint,
    params: { id_token: token, state },
  })
}
export async function edusharingKeys(_: Request, res: Response) {
  createJWKSResponse({
    res,
    keyid: edusharingEmbedKeys.keyId,
    publicKey: edusharingEmbedKeys.publicKey,
  })
}
export async function edusharingDone(req: Request, res: Response) {
  if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') {
    res
      .status(400)
      .send('"content-type" is not "application/x-www-form-urlencoded"')

    return
  }

  if (typeof req.body.JWT !== 'string') {
    res.status(400).send('JWT token is missing in the request')
    return
  }

  const decodedJwt = jwt.decode(req.body.JWT)

  if (!t.type({ iss: t.string }).is(decodedJwt)) {
    res.status(400).send('Failed to decode jwt')
    return
  }

  const edusharingClientIdOnSerloEditor = decodedJwt.iss

  const edusharingAsToolConfig = getEdusharingAsToolConfiguration({
    edusharingClientIdOnSerloEditor,
  })
  if (!edusharingAsToolConfig) {
    res
      .status(400)
      .send(
        `Could not find endpoints for LTI tool ${edusharingClientIdOnSerloEditor}`
      )

    return
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
    res.status(400).send('data claim in JWT is missing')
    return
  }

  const nonceId = parseObjectId(data)

  if (nonceId == null) {
    res.status(400).send('data claim in JWT is invalid')
    return
  }

  const findResult = await edusharingEmbedNonces.findOneAndDelete({
    _id: nonceId,
  })
  if (!findResult.ok) {
    res.status(400).send('No entry found in deeplinkNonces')
    return
  }

  const deeplinkNonce = findResult.value

  if (!t.type({ nonce: t.string }).is(deeplinkNonce)) {
    res.status(400).send('deeplink flow session expired')
    return
  }

  if (decoded.nonce !== deeplinkNonce.nonce) {
    res.status(400).send('nonce is invalid')
    return
  }

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
  if (!expectedJwtType.is(decoded)) {
    res.status(400).send('malformed custom claim in JWT send')
    return
  }

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
}
export async function edusharingGet(req: Request, res: Response) {
  const idToken = res.locals.token
  if (!idToken) {
    res.json({
      detailsSnippet: `<b>No IdToken provided</b>`,
    })
    return
  }
  const { iss } = idToken
  const edusharingAsToolConfig = getEdusharingAsToolConfiguration({
    issWhenEdusharingLaunchedSerloEditor: iss,
  })
  if (!edusharingAsToolConfig) {
    res.json({
      detailsSnippet: `<b>Could not find endpoints for LTI tool ${iss}</b>`,
    })
    return
  }

  const custom: unknown = res.locals.context?.custom

  if (!t.type({ dataToken: t.string }).is(custom)) {
    res.json({
      detailsSnippet: `<b>The LTI claim https://purl.imsglobal.org/spec/lti/claim/custom was invalid during request to endpoint ${req.path}</b>`,
    })
    return
  }

  const nodeId = req.query['nodeId']
  const repositoryId = req.query['repositoryId']
  if (!nodeId || !repositoryId) {
    res.json({
      detailsSnippet: `<b>Missing nodeId or missing repositoryId</b>`,
    })
    return
  }

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
    keyid: edusharingEmbedKeys.keyId,
    privateKey: edusharingEmbedKeys.privateKey,
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
}

function parseObjectId(objectId: string): ObjectId | null {
  try {
    return new ObjectId(objectId)
  } catch {
    return null
  }
}
