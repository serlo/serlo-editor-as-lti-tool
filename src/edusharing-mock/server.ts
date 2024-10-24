import express, { Request, Response } from 'express'
import multer from 'multer'
import * as t from 'io-ts'
import { testContent } from './test-content'
import { imageEmbedJson } from './mocked-embed-json/image'
import { v4 as uuid_v4 } from 'uuid'
import * as jose from 'jose'
import urlJoin from 'url-join'
import { createAutoFromResponse } from '../backend/edusharing/create-auto-form-response'
import { serverLog } from '../utils/server-log'
import config from '../utils/config'

export const editorUrl = config.EDITOR_URL

export const edusharingMockClientId = 'edusharing-mock'

const VersionComment = t.union([t.null, t.string, t.array(t.string)])

export class EdusharingServer {
  private keys = jose.generateKeyPair('RS256', {
    modulusLength: 2048,
  })
  private keyId = uuid_v4()
  private state = '2452454263425'
  private nonce = '8356345643564'
  private defaultCustom = {
    getContentApiUrl:
      'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/content',
    fileName: 'Test Content',
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
  private content: unknown = testContent
  public savedVersions: Array<{ comment: t.TypeOf<typeof VersionComment> }> = []
  private loginHint = uuid_v4()
  private contextId = uuid_v4()

  constructor() {
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))

    this.app.get('/', (_req, res) => {
      createAutoFromResponse({
        res,
        targetUrl: urlJoin(editorUrl, 'lti/login'),
        params: {
          target_link_uri: urlJoin(editorUrl, 'lti/launch'),
          iss: 'http://localhost:8100/edu-sharing',
          login_hint: this.loginHint,
          lti_message_hint: uuid_v4(), // TODO: Maybe make this be a fixed value for tests?
          lti_deployment_id: '1',
          client_id: 'piQ0JV8O880ZrVt',
        },
      })
    })

    // Called during opening editor as lti tool by lti.js
    this.app.get('/edu-sharing/rest/ltiplatform/v13/auth', async (req, res) => {
      const state = req.query['state']
      if (!state) {
        res.sendStatus(400).send('Query parameter state was missing')
        return
      }

      const payload = {
        nonce: req.query['nonce'],
        iss: 'http://localhost:8100/edu-sharing',
        aud: 'piQ0JV8O880ZrVt',
        sub: this.loginHint,
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': '1',
        given_name: 'TestUser',
        family_name: 'TestUser',
        email: 'testuser@example.com',
        'https://purl.imsglobal.org/spec/lti/claim/tool_platform': {
          name: 'local',
          product_family_code: 'edu-sharing',
          guid: 'local',
          description: 'local',
          version: '9.0',
        },
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/roles': [],
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: this.contextId,
          label: this.custom.user,
        },
        'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': urlJoin(
          editorUrl,
          'lti/launch'
        ),
        'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
          id: '604f62c1-6463-4206-a571-8c57097a54ae',
          title: 'Test Content',
        },
        'https://purl.imsglobal.org/spec/lti/claim/launch_presentation': {
          document_target: 'window',
          return_url: `http://localhost:8100/edu-sharing/components/workspace?id=${this.contextId}&mainnav=true&displayType=0`,
          locale: 'de_DE',
        },
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/custom': this.custom, // Custom object is sent to the tool server. There it is available through res.locals.token.platformContext.custom
      }

      const idToken = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: this.keyId, typ: 'JWT' })
        .setExpirationTime('10s')
        .setIssuedAt()
        .sign((await this.keys).privateKey)

      createAutoFromResponse({
        res,
        method: 'POST',
        targetUrl: urlJoin(editorUrl, 'lti/launch'),
        params: {
          id_token: idToken,
          state: state.toString(),
        },
      })
    })

    this.app.get('/edu-sharing/rest/lti/v13/jwks', async (_req, res) => {
      const jwk = await jose.exportJWK((await this.keys).publicKey)
      res.json({
        keys: [
          {
            kid: this.keyId,
            alg: 'RS256',
            use: 'sig',
            ...jwk,
          },
        ],
      })
    })

    // Currently unused
    this.app.get('/edu-sharing/rest/ltiplatform/v13/content', (_req, res) => {
      res.json(this.content)
    })

    const storage = multer.memoryStorage()
    const upload = multer({ storage })

    // Currently unused
    this.app.post(
      '/edu-sharing/rest/ltiplatform/v13/content',
      upload.single('file'),
      (req, res) => {
        const comment = req.query['versionComment'] ?? null
        if (!req.file) {
          res.sendStatus(400).send('req.file was missing')
          return
        }

        if (VersionComment.is(comment)) {
          this.savedVersions.push({ comment })
          this.content = JSON.parse(req.file.buffer.toString())
          serverLog(
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
        if (!req.query['login_hint']) {
          res.sendStatus(400).send('Query parameter login_hint was missing')
          return
        }

        const targetParameters = {
          iss: editorUrl,
          target_link_uri:
            'http://localhost:8100/edu-sharing/rest/lti/v13/lti13',
          client_id: 'edusharing-mock',
          lti_deployment_id: '1',
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
          targetUrl: urlJoin(editorUrl, 'edusharing-embed/login'),
          params: {
            scope: 'openid',
            response_type: 'id_token',
            client_id: 'edusharing-mock',
            login_hint: req.query['login_hint'].toString(),
            state: this.state,
            response_mode: 'form_post',
            nonce: this.nonce,
            prompt: 'none',
            redirect_uri:
              'http://localhost:8100/edu-sharing/rest/lti/v13/lti13',
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
        res.status(400).send('id_token is undefined')
        return
      }

      const serloEditorJwks = jose.createRemoteJWKSet(
        new URL(urlJoin(editorUrl, 'edusharing-embed/keys'))
      )

      const verifyResult = await jose.jwtVerify(
        req.body.id_token,
        serloEditorJwks,
        {
          audience: edusharingMockClientId,
          issuer: editorUrl,
          subject: this.user,
        }
      )

      const idToken = verifyResult.payload

      const deepLinkingSettingsClaim =
        idToken[
          'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'
        ]
      if (!t.type({ data: t.string }).is(deepLinkingSettingsClaim)) {
        res.status(400).send('Missing deep_linking_settings claim in id token')
        return
      }

      const payload = {
        iss: edusharingMockClientId,
        aud: editorUrl,
        nonce: this.nonce,
        azp: editorUrl,
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id': '2',
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti-dl/claim/data':
          deepLinkingSettingsClaim.data,
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
            title: 'Test Image',
            url: 'http://localhost:8100/edu-sharing/rest/lti/v13/lti13/960c48d0-5e01-45ca-aaf6-d648269f0db2',
          },
        ],
      }

      const jwt = await new jose.SignJWT(payload)
        .setIssuedAt()
        .setProtectedHeader({ alg: 'RS256', kid: this.keyId, typ: 'JWT' })
        .setExpirationTime('1h')
        .sign((await this.keys).privateKey)

      createAutoFromResponse({
        res,
        method: 'POST',
        targetUrl: urlJoin(editorUrl, 'edusharing-embed/done'),
        params: {
          JWT: jwt,
        },
      })
    })

    this.app.get('/edu-sharing/rest/lti/v13/details/*/*', (_req, res) => {
      res.json(imageEmbedJson)
    })

    this.app.all('*', (req, res) => {
      serverLog(`${req.method} call to ${req.url} registered`)
      res.sendStatus(404).end()
    })
  }

  init() {
    this.savedVersions = []
    this.custom = { ...this.defaultCustom }
    this.content = testContent
  }

  removePropertyInCustom(propertyName: string): boolean {
    if (!(propertyName in this.custom)) {
      return false
    }

    return delete this.custom[propertyName as keyof typeof this.custom]
  }

  listen(port: number, callback: () => void) {
    return this.app.listen(port, callback)
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
    res.status(400).json({
      error: `Editor send invalid value '${value}' for '${name}'`,
      context: 'edusharing-mock-server',
      location: req.route.path,
    })
    return true
  }
}
