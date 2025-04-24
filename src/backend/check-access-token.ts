import { Request } from 'express'
import { createAndLogError } from '../utils/logger'
import { AccessTokenType } from './types/access-token'
import config from '../utils/config'
import jwt from 'jsonwebtoken'

export function checkAccessToken(req: Request) {
  const accessToken: unknown = req.get('X-Access-Token')
  if (typeof accessToken !== 'string')
    throw createAndLogError('Missing access token while getting entity')

  // Throws if signature invalid
  const decodedAccessToken = jwt.verify(accessToken, config.LTIJS_KEY)

  if (!AccessTokenType.is(decodedAccessToken))
    throw createAndLogError(
      `Unexpected access token type. Got: ${JSON.stringify(decodedAccessToken)}`
    )

  return decodedAccessToken
}
