import { KeyObject } from 'crypto'
import { type Response } from 'express'

export function createJWKSResponse(args: {
  res: Response
  keyid: string
  publicKey: KeyObject
}) {
  const { res, keyid, publicKey } = args

  res.json({
    keys: [
      {
        kid: keyid,
        alg: 'RS256',
        use: 'sig',
        ...publicKey.export({ format: 'jwk' }),
      },
    ],
  })
}
