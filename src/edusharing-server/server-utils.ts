import type { Response } from 'express'
import jwt, { VerifyOptions } from 'jsonwebtoken'
import JWKSClient, { JwksClient } from 'jwks-rsa'
import escape from 'lodash/escape'
import { KeyObject } from 'crypto'

const jwksClients: Record<string, JwksClient | undefined> = {}

export function createJWKSResponse(args: {
  res: Response
  keyid: string
  publicKey: KeyObject
}) {
  const { res, keyid, publicKey } = args

  res
    .json({
      keys: [
        {
          kid: keyid,
          alg: 'RS256',
          use: 'sig',
          ...publicKey.export({ format: 'jwk' }),
        },
      ],
    })
    .end()
}

const defaultExpireAfterSeconds = 15

export function signJwtWithBase64Key({
  payload,
  keyid,
  privateKey,
  expireAfterSeconds,
}: {
  payload: Omit<jwt.JwtPayload, 'iat'>
  keyid: string
  privateKey: KeyObject
  expireAfterSeconds?: number
}) {
  return signJwt({
    payload,
    keyid,
    privateKey,
    expireAfterSeconds,
  })
}

export function signJwt({
  payload,
  keyid,
  privateKey,
  expireAfterSeconds = defaultExpireAfterSeconds,
}: {
  payload: Omit<jwt.JwtPayload, 'iat'>
  keyid: string
  privateKey: KeyObject
  expireAfterSeconds?: number
}) {
  return jwt.sign(
    { ...payload, iat: Math.floor(Date.now() / 1000) },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: expireAfterSeconds,
      keyid,
    }
  )
}

export function verifyJwt(args: {
  token: string
  verifyOptions: VerifyOptions
  keysetUrl: string
}): Promise<
  | { success: true; decoded: jwt.JwtPayload }
  | { success: false; status: number; error: string }
> {
  const { token, verifyOptions, keysetUrl } = args

  return new Promise((resolve) => {
    // We want to make ensure that the JWT is never older than 1min
    verifyOptions.maxAge = 60

    jwt.verify(token, getKey, verifyOptions, (err, decoded) => {
      if (err != null) {
        resolve({ success: false, status: 400, error: err.message })
      } else {
        // TODO: Use no "as"
        resolve({ success: true, decoded: decoded as jwt.JwtPayload })
      }
    })

    function getKey(
      header: { kid?: string },
      callback: (_: Error, key: string) => void
    ) {
      if (header.kid == null) {
        resolve({
          success: false,
          status: 400,
          error: 'No keyid was provided in the JWT',
        })
      } else {
        fetchSigningKey(header.kid)
          .then((key) => {
            if (typeof key === 'string') {
              callback(null, key)
            }
          })
          .catch((err) => {
            resolve({ success: false, status: 400, error: err.message })
          })
      }

      async function fetchSigningKey(keyid: string): Promise<string | null> {
        const jwksClient =
          jwksClients[keysetUrl] != null
            ? jwksClients[keysetUrl]
            : JWKSClient({
                jwksUri: keysetUrl,
                cache: process.env.NODE_ENV === 'production',
              })

        jwksClients[keysetUrl] = jwksClient

        try {
          const signingKey = await jwksClient.getSigningKey(keyid)

          return signingKey.getPublicKey()
        } catch (err) {
          resolve({
            success: false,
            status: 502,
            error: 'An error occured while fetching key from the keyset URL',
          })

          return null
        }
      }
    }
  })
}

export function createAutoFromResponse({
  res,
  method = 'GET',
  targetUrl,
  params,
}: {
  res: Response
  method?: 'GET' | 'POST'
  targetUrl: string
  params: Record<string, string>
}) {
  const escapedTargetUrl = escape(targetUrl)
  const formDataHtml = Object.entries(params)
    .map(([name, value]) => {
      const escapedValue = escape(value)
      return `<input type="hidden" name="${name}" value="${escapedValue}" />`
    })
    .join('\n')

  res.setHeader('Content-Type', 'text/html')
  res.send(
    `<!DOCTYPE html>
     <html>
     <head><title>Redirect to ${escapedTargetUrl}</title></head>
     <body>
       <form id="form" action="${escapedTargetUrl}" method="${method}">
         ${formDataHtml}
       </form>
       <script type="text/javascript">
         document.getElementById("form").submit();
       </script>
     </body>
     </html>
    `.trim()
  )
  res.end()
}
