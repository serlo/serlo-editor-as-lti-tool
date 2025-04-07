import { IdToken } from '../types/idtoken'
import * as Sentry from '@sentry/node'
import { EdusharingLtiCustomClaimType } from '../types/edu-sharing-lti-custom-claim'
import { Provider } from 'ltijs'

export async function getEdusharingInfo(idToken: IdToken, custom: unknown) {
  // @ts-expect-error @types/ltijs
  const platform = await Provider.getPlatform(idToken.iss, idToken.clientId)
  if (!platform) {
    const error = new Error(`Getting edu-sharing info: Did not find platform`)
    Sentry.captureException(error)
    throw error
  }
  const privateKey = await platform.platformPrivateKey()
  const keyId = await platform.platformKid()

  if (typeof privateKey !== 'string' || typeof keyId !== 'string') {
    const error = new Error(`Getting edu-sharing info: Key was missing`)
    Sentry.captureException(error)
    throw error
  }

  if (!EdusharingLtiCustomClaimType.is(custom)) {
    const error = new Error(
      `Getting edu-sharing info: LTI custom malformed. Was ${JSON.stringify(
        custom
      )}`
    )
    Sentry.captureException(error)
    throw error
  }

  return {
    keyId,
    privateKey,
    appId: custom.appId,
    nodeId: custom.nodeId,
    user: custom.user,
    postContentApiUrl: custom.postContentApiUrl,
    getContentApiUrl: custom.getContentApiUrl,
    dataToken: custom.dataToken,
    version: custom.version,
    fileName: custom.fileName,
  }
}
