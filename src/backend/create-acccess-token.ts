import jwt from 'jsonwebtoken'

export function createAccessToken(
  editorMode: 'read' | 'write',
  entityId: number,
  signingKey: string
) {
  return jwt.sign(
    {
      entityId: entityId,
      accessRight: editorMode,
    },
    signingKey, // Reuse the symmetric HS256 key used by ltijs to sign ltik and database entries
    { expiresIn: '3 days' }
  )
}
