import express from 'express'
import { v4 as uuid_v4 } from 'uuid'
import * as jose from 'jose'
import urlJoin from 'url-join'
import { createAutoFormResponse } from '../backend/util/create-auto-form-response'
import { readEnvVariable } from '../backend/read-env-variable'

const itslearningMockDeploymentId = '1'
const itslearningMockIssuer = 'http://localhost:8101/itslearning'
const itslearningMockAudience = 'mock-itslearning-id'
const itslearningMockContextId = '3061-99'

const editorUrl = readEnvVariable('EDITOR_URL')

export class ItslearningServer {
  private keys = jose.generateKeyPair('RS256', {
    modulusLength: 2048,
  })
  private keyId = uuid_v4()
  private roles: string[] = []
  private app = express()

  constructor() {
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))

    this.app.get('/', (_req, res) => {
      createAutoFormResponse({
        res,
        targetUrl: urlJoin(editorUrl, 'lti/login'),
        params: {
          target_link_uri: urlJoin(editorUrl, 'lti/launch'),
          iss: itslearningMockIssuer,
          login_hint: itslearningMockIssuer,
          lti_message_hint: uuid_v4(),
          lti_deployment_id: itslearningMockDeploymentId,
          client_id: itslearningMockAudience,
        },
      })
    })

    // Called during opening editor as lti tool by lti.js
    this.app.get('/itslearning/connect/authorize', async (req, res) => {
      const state = req.query['state']
      if (!state) {
        res.sendStatus(400).send('Query parameter state was missing').end()
        return
      }

      const payload = {
        nonce: req.query['nonce'],
        iss: itslearningMockIssuer,
        aud: itslearningMockAudience,
        sub: 'itslearning-mock-sub',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
          itslearningMockDeploymentId,
        given_name: 'TestUser',
        family_name: 'TestUser',
        email: 'testuser@example.com',
        'https://purl.imsglobal.org/spec/lti/claim/tool_platform': {
          guid: '3061',
          name: 'Demo TP  demojanasik',
          product_family_code: 'itslearning',
        },
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/roles': this.roles,
        'https://purl.imsglobal.org/spec/lti/claim/context': {
          id: itslearningMockContextId,
          title: 'Serlo',
          type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseSection'],
        },
        'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': urlJoin(
          editorUrl,
          'lti/launch'
        ),
        'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
          id: '3061:3245',
          title: 'Test Content',
        },
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiResourceLinkRequest',
        'https://purl.imsglobal.org/spec/lti/claim/custom': {
          id: '00000000-0000-0000-0000-000000000000',
        }, // Custom object is sent to the tool server. There it is available through res.locals.token.platformContext.custom
      }

      const idToken = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: this.keyId, typ: 'JWT' })
        .setExpirationTime('10s')
        .setIssuedAt()
        .sign((await this.keys).privateKey)

      createAutoFormResponse({
        res,
        method: 'POST',
        targetUrl: urlJoin(editorUrl, 'lti/launch'),
        params: {
          id_token: idToken,
          state: state.toString(),
        },
      })
    })

    this.app.get(
      '/itslearning/.well-known/openid-configuration/jwks',
      async (_req, res) => {
        const jwk = await jose.exportJWK((await this.keys).publicKey)
        res
          .json({
            keys: [
              {
                kid: this.keyId,
                alg: 'RS256',
                use: 'sig',
                ...jwk,
              },
            ],
          })
          .end()
      }
    )
  }

  setInstructorRole() {
    this.roles = [
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
    ]
  }

  setLearnerRole() {
    this.roles = ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner']
  }

  listen(port: number, callback: () => void) {
    return this.app.listen(port, callback)
  }
}
