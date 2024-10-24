import jwt from 'jsonwebtoken'
import { AccessToken } from '../../src/backend'

export function modifyAccessTokenEntityId(url: URL): string {
  const originalAccessToken = url.searchParams.get('accessToken')
  const parsedOriginalAccessToken = jwt.decode(
    originalAccessToken
  ) as AccessToken
  const newParsedAccessToken = {
    ...parsedOriginalAccessToken,
    entityId: '123',
  }
  const newAccessToken = jwt.sign(
    newParsedAccessToken,
    url.searchParams.get('ltik')
  )
  return newAccessToken
}

export function expireAccessToken(url: URL): string {
  const originalAccessToken = url.searchParams.get('accessToken')
  const { entityId, accessRight } = jwt.decode(
    originalAccessToken
  ) as AccessToken
  const newAccessToken = jwt.sign(
    { entityId, accessRight },
    url.searchParams.get('ltik'),
    { expiresIn: '-1s' }
  )
  return newAccessToken
}
