import jwt from 'jsonwebtoken'
import { AccessToken } from '../types/access-token'

export function createAccessToken(
  editorMode: 'read' | 'write',
  entityId: string,
  signingKey: string
) {
  const accessToken: AccessToken = {
    entityId,
    accessRight: editorMode,
  }

  return jwt.sign(accessToken, signingKey, { expiresIn: '3 days' })
}
