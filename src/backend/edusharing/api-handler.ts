import { Request, Response } from 'express'
import { IdToken } from '../types/idtoken'
import { getEdusharingInfo } from './get-edusharing-info'
import * as Sentry from '@sentry/node'
import jwt from 'jsonwebtoken'
import { EdusharingLtiCustomClaimType } from '../types/edu-sharing-lti-custom-claim'
import { Provider } from 'ltijs'
import config from '../../utils/config'

export function getEdusharingApiHandler() {
  return {
    createOrGetEntity: async (
      req: Request,
      res: Response,
      idToken: IdToken
    ) => {},
    getEntity: getEntityFromEdusharing,
  }
}

async function getEntityFromEdusharing(
  _: Request,
  res: Response
): Promise<void> {
  const custom = res.locals.context?.custom

  if (!EdusharingLtiCustomClaimType.is(custom)) {
    const error = new Error(
      `Getting edu-sharing info: LTI custom malformed. Was ${JSON.stringify(
        custom
      )}`
    )
    Sentry.captureException(error)
    throw error
  }

  const { token } = res.locals
  if (!token) {
    const error = new Error(
      `Getting edu-sharing info: LTI token malformed. Was ${JSON.stringify(
        token
      )}`
    )
    Sentry.captureException(error)
    throw error
  }
  // TODO: check if that works
  const platforms = await Provider.getPlatform(token.iss)
  if (!platforms) {
    const error = new Error(
      `Getting edu-sharing info: platform not found for ${token.iss}`
    )
    Sentry.captureException(error)
    throw error
  }

  const { appId, nodeId, user, getContentApiUrl, version, dataToken } = custom
  const payload = {
    appId,
    nodeId,
    user,
    ...(version != null ? { version } : {}),
    dataToken,
  }

  const privateKey = await platforms[0].platformPrivateKey()
  if (!privateKey) {
    const error = new Error(
      `Getting edu-sharing info: no private key found for ${JSON.stringify(
        platforms[0]
      )}`
    )
    Sentry.captureException(error)
    throw error
  }

  const keyid = await platforms[0].platformKid()

  const message = jwt.sign(payload, privateKey, {
    keyid,
    algorithm: 'RS256',
  })
  const url = new URL(getContentApiUrl)

  url.searchParams.append('jwt', message)

  const response = await fetch(url.href)

  res.status(response.status).send(await response.text())
}

export async function saveEntityInEdusharing(
  req: Request,
  res: Response,
  idToken: IdToken
) {
  const {
    appId,
    dataToken,
    keyId,
    nodeId,
    postContentApiUrl,
    privateKey,
    user,
  } = await getEdusharingInfo(idToken, res.locals.context?.custom)

  if (!postContentApiUrl) {
    Sentry.captureException(
      new Error(`Saving to edu-sharing: postContentApiUrl was missing`)
    )
    return
  }

  const editorStateString = JSON.stringify(req.body.editorState)

  const payload = {
    appId,
    nodeId,
    user,
    dataToken,
  }
  const message = jwt.sign(payload, privateKey, {
    keyid: keyId,
    algorithm: 'RS256',
  })

  const url = new URL(postContentApiUrl)
  url.searchParams.append('jwt', message)
  url.searchParams.append('mimetype', 'application/json')
  url.searchParams.append('versionComment', 'Automatische Speicherung')

  const blob = new Blob([editorStateString], {
    type: 'application/json',
  })

  const data = new FormData()
  data.set('file', blob)

  const response = await fetch(url.href, {
    method: 'POST',
    body: data,
  })

  if (!response.ok) {
    Sentry.captureException(
      new Error(
        `Saving to edu-sharing: Fetch failed with status ${response.status} and body ${JSON.stringify(response.body)}`
      )
    )
    return
  }
}
