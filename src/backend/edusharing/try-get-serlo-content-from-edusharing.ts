import { getEdusharingInfo } from './get-edusharing-info'
import * as jwt from 'jsonwebtoken'
import { IdToken } from '../types/idtoken'

export async function tryGetSerloEntityFromEdusharing(
  idToken: IdToken,
  custom: unknown
) {
  const {
    appId,
    dataToken,
    keyId,
    nodeId,
    version,
    privateKey,
    user,
    getContentApiUrl,
  } = await getEdusharingInfo(idToken, custom)

  const payload = {
    appId,
    nodeId,
    user,
    ...(version != null ? { version } : {}),
    dataToken,
  }
  const message = jwt.sign(payload, privateKey, {
    keyid: keyId,
    algorithm: 'RS256',
  })

  const url = new URL(getContentApiUrl)
  url.searchParams.append('jwt', message)

  const edusharingResponse = await fetch(url.href)

  if (!edusharingResponse.ok) return null

  const stringifiedDocumentState = await edusharingResponse.text()

  return stringifiedDocumentState ? stringifiedDocumentState : null
}
