import express, { Request, Response } from 'express'
import multer from 'multer'
import * as t from 'io-ts'
import { kitchenSinkContent } from './kitchen-sink-content'
import { createAutoFromResponse } from './server-utils'
import { imageEmbedJson } from './mocked-embed-json/image'
// import jwt from 'jsonwebtoken'
// import { generateKeyPairSync, KeyObject } from 'crypto'
import { v4 as uuid_v4 } from 'uuid'
import * as jose from 'jose'

// We define the absence of `versionComment` with `null` so that we can
// tranfer it inside the cypress environment (only proper JSON can be
// transfered)
const VersionComment = t.union([t.null, t.string, t.array(t.string)])

const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
  modulusLength: 2048,
})
const keyid = uuid_v4()

export class EdusharingServer {
  private keyid = 'key'
  private state = 'state-value'
  private nonce = 'nonce-value'
  private defaultCustom = {
    getContentApiUrl:
      'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/content',
    fileName: 'Hello world',
    getDetailsSnippetUrl:
      'http://localhost:8100/edu-sharing/rest/lti/v13/details',
    dataToken:
      'kOXGc6AbqYW7iHOl3b48Pj/ngudoLCZk+DJwYxAg9wTiKsN9TKRY13qU+6vNNMEV2Guya3NPWO+Ay8IJDtQWMKxnkku/3mc+n64TIgMjs2yY7wXMYcvoRK4C9iXXpydNWQCGreYU2BcnMwne/b5BngOvBjqqVCPLMGT/lmvylP//GCzM7V99h9fKVMrgY97qOdsB1O0Ti//E3odWU1dFUMu3NLPy3MdTHXdViQpyPFRpgnZ8kcywDl0bLYSKy0pUuJy0hBvlnGmFyKlcQ38HaR2CZ9wRxrNgRxxEzGd8J+T6YSNoD8OyB9Nyjbp0N3tog4XhEZ/UASIqLYBzk+ygOA==',
    postContentApiUrl:
      'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/content',
    appId: 'qsa2DgKBJ2WgoJO1',
    nodeId: '604f62c1-6463-4206-a571-8c57097a54ae',
    user: 'admin',
  }
  private user = 'admin'
  private custom = this.defaultCustom
  private app = express()
  private content: unknown = kitchenSinkContent
  public savedVersions: Array<{ comment: t.TypeOf<typeof VersionComment> }> = []

  constructor() {
    // const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    //   modulusLength: 2048,
    // })

    // this.privateKey = privateKey
    // this.publicKey = publicKey
    // this.key = process.env.EDITOR_PRIVATE_KEY_FOR_EMBEDDING

    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))

    this.app.get('/', (_req, res) => {
      createAutoFromResponse({
        res,
        targetUrl: process.env.EDITOR_URL + 'lti/login',
        params: {
          target_link_uri: process.env.EDITOR_URL + 'lti/launch',
          iss: 'http://localhost:8100/edu-sharing',

          // Test whether this is optional
          login_hint: this.user,
          lti_message_hint: 'd882efaa-1f84-4a0f-9bc9-4f74f19f7576',
          lti_deployment_id: '1',
          client_id: 'piQ0JV8O880ZrVt',
        },
      })
    })

    // Called during opening editor as lti tool by lti.js
    this.app.get('/edu-sharing/rest/ltiplatform/v13/auth', async (req, res) => {
      const payload = {
        nonce: req.query['nonce'],
        iss: 'http://localhost:8100/edu-sharing',
        aud: 'piQ0JV8O880ZrVt',
        sub: this.user,
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': '1',
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: 'd882efaa-1f84-4a0f-9bc9-4f74f19f7576',
          label: 'Home des Unternehmens',
        },
        given_name: 'Administrator',
        family_name: '',
        email: 'admin@alfresco.com',
        'https://purl.imsglobal.org/spec/lti/claim/tool_platform': {
          name: 'local',
          product_family_code: 'edu-sharing',
          guid: 'serlo-edusharing',
          description: 'local',
          version: '9999.14076175.9999',
        },
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/roles': [],
        'https://purl.imsglobal.org/spec/lti/claim/target_link_uri':
          process.env.EDITOR_URL + 'lti/launch',
        'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
          id: '604f62c1-6463-4206-a571-8c57097a54ae',
          title: 'Hello worldd',
        },
        'https://purl.imsglobal.org/spec/lti/claim/launch_presentation': {
          document_target: 'window',
          return_url:
            'http://localhost:8100/edu-sharing/components/workspace?id=d882efaa-1f84-4a0f-9bc9-4f74f19f7576&mainnav=true&displayType=0',
          locale: 'de_DE',
        },
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/custom': this.custom, // Custom object is sent to the tool server. There it is available through res.locals.token.platformContext.custom
      }

      const idToken = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: keyid })
        .sign(privateKey)

      // const idToken = jwt.sign(payload, this.privateKey, {
      //   algorithm: 'RS256',
      //   keyid: this.keyid,
      // })

      // const idToken = signJwtWithBase64Key({
      //   payload,
      //   keyid: this.keyid,
      //   key: this.key,
      // })

      createAutoFromResponse({
        res,
        method: 'POST',
        targetUrl: process.env.EDITOR_URL + 'lti/launch',
        params: {
          id_token: idToken,
          state: req.query['state'].toString(),
        },
      })
    })

    this.app.get('/edu-sharing/rest/lti/v13/jwks', async (_req, res) => {
      console.log('Keys requested')
      const jwk = await jose.exportJWK(publicKey)
      res
        .json({
          keys: [
            {
              kid: keyid,
              alg: 'RS256',
              use: 'sig',
              ...jwk,
            },
          ],
        })
        .end()

      // const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })
      // res
      //   .json({
      //     keys: [
      //       {
      //         kid: keyid,
      //         alg: 'RS256',
      //         use: 'sig',
      //         ...JSONWebKey.fromPEM(
      //           Buffer.from(key, 'base64').toString('utf-8')
      //         ).toJSON(),
      //       },
      //     ],
      //   })
      //   .end()
      // createJWKSResponse({
      //   res,
      //   keyid: this.keyid,
      //   key: this.publicKey,
      // })
    })

    this.app.get('/edu-sharing/rest/ltiplatform/v13/content', (_req, res) => {
      res.json(this.content).end()
    })

    const storage = multer.memoryStorage()
    const upload = multer({ storage })

    this.app.post(
      '/edu-sharing/rest/ltiplatform/v13/content',
      upload.single('file'),
      (req, res) => {
        const comment = req.query['versionComment'] ?? null

        if (VersionComment.is(comment)) {
          this.savedVersions.push({ comment })
          this.content = JSON.parse(req.file.buffer.toString())
          console.log(
            `[${new Date().toISOString()}]: Save registered with comment ${
              req.query['versionComment']
            }`
          )
          res.sendStatus(200).end()
        } else {
          // Aparently `versionComment` was specified as an object (see
          // https://www.npmjs.com/package/qs) which should never happen
          res.sendStatus(400).end()
        }
      }
    )

    this.app.get(
      '/edu-sharing/rest/lti/v13/oidc/login_initiations',
      (req, res) => {
        const targetParameters = {
          iss: process.env.EDITOR_URL,
          target_link_uri:
            'http://localhost:8100/edu-sharing/rest/lti/v13/lti13',
          client_id: 'editor',
          lti_deployment_id: '2',
        }

        for (const [name, targetValue] of Object.entries(targetParameters)) {
          const value = req.query[name]

          if (isEditorValueInvalid({ req, res, name, value, targetValue })) {
            return
          }
        }

        createAutoFromResponse({
          res,
          method: 'GET',
          targetUrl: process.env.EDITOR_URL + 'platform/login',
          params: {
            nonce: this.nonce,
            state: this.state,
            login_hint: req.query['login_hint'].toString(),
            redirect_uri:
              'http://localhost:8100/edu-sharing/rest/lti/v13/lti13',
            client_id: 'editor',
          },
        })
      }
    )

    this.app.post('/edu-sharing/rest/lti/v13/lti13', async (req, res) => {
      if (
        isEditorValueInvalid({
          req,
          res,
          name: 'state',
          value: req.body.state,
          targetValue: this.state,
        })
      )
        return

      if (typeof req.body.id_token !== 'string') {
        res.status(400).send('id_token is undefined').end()
        return
      }

      const serloEditorJwks = jose.createRemoteJWKSet(
        new URL(process.env.EDITOR_URL + 'platform/keys')
      )

      const verifyResult = await jose.jwtVerify(
        req.body.id_token,
        serloEditorJwks,
        {
          audience: 'editor',
          issuer: process.env.EDITOR_URL,
          subject: this.user,
        }
      )

      const idToken = verifyResult.payload

      // const verifyResult = await verifyJwt({
      //   keysetUrl: process.env.EDITOR_URL + 'platform/keys',
      //   token: req.body.id_token,
      //   verifyOptions: {
      //     audience: process.env.EDITOR_CLIENT_ID_FOR_EMBEDDING,
      //     issuer: process.env.EDITOR_URL,
      //     subject: this.user,
      //     nonce: this.nonce,
      //   },
      // })

      // if (verifyResult.success === false) {
      //   res.status(verifyResult.status).send(verifyResult.error)
      //   return
      // }

      const payload = {
        iss: 'editor',
        aud: process.env.EDITOR_URL,
        nonce: this.nonce,
        azp: process.env.EDITOR_URL,
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': '2',
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti-dl/claim/data':
          idToken[
            'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'
          ].data,
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
          {
            custom: {
              repositoryId: 'serlo-edusharing',
              nodeId: '960c48d0-5e01-45ca-aaf6-d648269f0db2',
            },
            icon: {
              width: 'null',
              url: 'http://localhost:8100/edu-sharing/themes/default/images/common/mime-types/svg/file-image.svg',
              height: 'null',
            },
            type: 'ltiResourceLink',
            title: '2020-11-13-152700_392x305_scrot.png',
            url: 'http://localhost:8100/edu-sharing/rest/lti/v13/lti13/960c48d0-5e01-45ca-aaf6-d648269f0db2',
          },
        ],
      }

      const jwt = await new jose.SignJWT(payload)
        .setIssuedAt()
        .setProtectedHeader({ alg: 'RS256', kid: keyid })
        .sign(privateKey)

      createAutoFromResponse({
        res,
        method: 'POST',
        targetUrl: process.env.EDITOR_URL + 'platform/done',
        params: {
          JWT: jwt,
          // JWT: jwt.sign(payload, privateKey, {
          //   algorithm: 'RS256',
          //   keyid: this.keyid,
          // }),
          // JWT: signJwtWithBase64Key({
          //   payload,
          //   keyid: this.keyid,
          //   key: this.key,
          // }),
          state: this.state,
        },
      })
    })

    this.app.get('/edu-sharing/rest/lti/v13/details/*/*', (_req, res) => {
      res.json(imageEmbedJson).end()
    })

    this.app.all('*', (req, res) => {
      console.error(`${req.method} call to ${req.url} registered`)
      res.sendStatus(404).end()
    })
  }

  init() {
    this.savedVersions = []
    this.custom = { ...this.defaultCustom }
    this.content = kitchenSinkContent
  }

  removePropertyInCustom(propertyName: string): boolean {
    if (!(propertyName in this.custom)) {
      return false
    }

    return delete this.custom[propertyName]
  }

  willSendContent(content: unknown) {
    this.content = content
  }

  listen(port: number, callback: () => void) {
    this.app.listen(port, callback)
  }
}

function isEditorValueInvalid(args: {
  req: Request
  res: Response
  name: string
  value: unknown
  targetValue: unknown
}): boolean {
  const { req, res, name, value, targetValue } = args

  if (value === targetValue) {
    return false
  } else {
    res
      .status(400)
      .json({
        error: `Editor send invalid value '${value}' for '${name}'`,
        context: 'edusharing-mock-server',
        location: req.route.path,
      })
      .end()
    return true
  }
}
