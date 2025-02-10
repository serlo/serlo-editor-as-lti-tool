import { Provider as ltijs } from 'ltijs'
import { edusharingAsToolConfigs } from '../edusharing'
import { logger } from '../../utils/logger'
import config from '../../utils/config'
import { edusharingMockClientId } from '../../../mocks'

export async function registerLtiPlatforms() {
  if (config.ENVIRONMENT === 'staging') {
    await registerSaltire()

    // Register platform: itslearning
    await registerPlatform({
      url: config.ITSLEARNING_URL,
      name: config.ITSLEARNING_NAME,
      clientId: config.SERLO_EDITOR_CLIENT_ID_ON_ITSLEARNING,
      authenticationEndpoint: config.ITSLEARNING_AUTHENTICATION_ENDPOINT,
      accesstokenEndpoint: config.ITSLEARNING_ACCESS_TOKEN_ENDPOINT,
      key: config.ITSLEARNING_KEYSET_ENDPOINT,
    })

    // Register platform: edu-sharing (RLP)
    const edusharingPlatform = await registerPlatform({
      url: config.EDUSHARING_RLP_URL,
      name: config.EDUSHARING_RLP_NAME,
      clientId: config.SERLO_EDITOR_CLIENT_ID_ON_EDUSHARING_RLP,
      authenticationEndpoint: config.EDUSHARING_RLP_AUTHENTICATION_ENDPOINT,
      accesstokenEndpoint: config.EDUSHARING_RLP_ACCESS_TOKEN_ENDPOINT,
      key: config.EDUSHARING_RLP_KEYSET_ENDPOINT,
    })
    if (edusharingPlatform) {
      edusharingAsToolConfigs.push({
        issWhenEdusharingLaunchedSerloEditor: config.EDUSHARING_RLP_URL,
        loginEndpoint: config.EDUSHARING_RLP_LOGIN_ENDPOINT,
        launchEndpoint: config.EDUSHARING_RLP_LAUNCH_ENDPOINT,
        clientId: config.EDUSHARING_RLP_CLIENT_ID_ON_SERLO_EDITOR,
        detailsEndpoint: config.EDUSHARING_RLP_DETAILS_ENDPOINT,
        keysetEndpoint: config.EDUSHARING_RLP_KEYSET_ENDPOINT,
      })
      logger.info('Registered tool: edu-sharing (RLP)')
    }
  }

  if (config.ENVIRONMENT === 'local') {
    await registerSaltire()

    // Register platform: edusharing mock
    const edusharingMockPlatform = await registerPlatform({
      url: 'http://localhost:8100/edu-sharing',
      name: 'edusharing-mock',
      clientId: 'piQ0JV8O880ZrVt', // The ID for this LTI tool on the LTI platform
      authenticationEndpoint:
        'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/auth',
      accesstokenEndpoint:
        'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/token',
      key: 'http://localhost:8100/edu-sharing/rest/lti/v13/jwks',
    })
    if (edusharingMockPlatform) {
      edusharingAsToolConfigs.push({
        issWhenEdusharingLaunchedSerloEditor:
          'http://localhost:8100/edu-sharing',
        loginEndpoint:
          'http://localhost:8100/edu-sharing/rest/lti/v13/oidc/login_initiations',
        launchEndpoint: 'http://localhost:8100/edu-sharing/rest/lti/v13/lti13',
        clientId: edusharingMockClientId,
        detailsEndpoint:
          'http://localhost:8100/edu-sharing/rest/lti/v13/details',
        keysetEndpoint: 'http://localhost:8100/edu-sharing/rest/lti/v13/jwks',
      })
      logger.info(`Registered tool: edusharing-mock`)
    }

    // Register platform: itslearning mock
    await registerPlatform({
      url: 'http://localhost:8101/itslearning',
      name: 'itslearning-mock',
      clientId: 'mock-itslearning-id',
      authenticationEndpoint:
        'http://localhost:8101/itslearning/connect/authorize',
      accesstokenEndpoint: 'http://localhost:8101/itslearning/connect/token',
      key: 'http://localhost:8101/itslearning/.well-known/openid-configuration/jwks',
    })

    // Register platform: edusharing (local docker)
    //   await registerPlatform({
    //     url: 'http://localhost:8100/edu-sharing', // LTI iss
    //     name: 'Platform', // TODO: Change
    //     clientId: 'aZZDRp40gsj459a', // The ID for this LTI tool on the LTI platform
    //     authenticationEndpoint:
    //       'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/auth',
    //     accesstokenEndpoint:
    //       'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/token',
    //       // key: 'http://localhost:8100/edu-sharing/rest/lti/v13/jwks',
    //       key: 'https://serlo-edusharing_repository-service_1:8080/edu-sharing/rest/lti/v13/jwks',
    //       // key: 'http://repository-service:8080/edu-sharing/rest/lti/v13/jwks',
    //   })
  }

  if (config.ENVIRONMENT === 'development') {
    await registerSaltire()

    // Register platform: moodle test
    await registerPlatform({
      url: config.MOODLE_URL,
      name: config.MOODLE_NAME,
      clientId: config.SERLO_EDITOR_CLIENT_ID_ON_MOODLE,
      authenticationEndpoint: config.MOODLE_AUTHENTICATION_ENDPOINT,
      accesstokenEndpoint: config.MOODLE_ACCESS_TOKEN_ENDPOINT,
      key: config.MOODLE_KEYSET_ENDPOINT,
    })
  }
}

async function registerPlatform({
  url,
  name,
  clientId,
  authenticationEndpoint,
  accesstokenEndpoint,
  key,
}: {
  url: string
  name: string
  clientId: string
  authenticationEndpoint: string
  accesstokenEndpoint: string
  key: string
}) {
  const platform = await ltijs.registerPlatform({
    url, // LTI iss
    name,
    clientId,
    authenticationEndpoint,
    accesstokenEndpoint,
    authConfig: {
      method: 'JWK_SET',
      key,
    },
  })
  if (platform) {
    logger.info(`Registered platform: ${name}`)
    return platform
  }
  throw new Error(`Platform ${name} could not be registered`)
}

async function registerSaltire() {
  return registerPlatform({
    url: 'https://saltire.lti.app/platform',
    name: 'saltire.lti.app',
    clientId: 'saltire.lti.app',
    authenticationEndpoint: 'https://saltire.lti.app/platform/auth',
    accesstokenEndpoint:
      'https://saltire.lti.app/platform/token/sc24671cd70c6e45554e6c405a2f5d966',
    key: 'https://saltire.lti.app/platform/jwks/sc24671cd70c6e45554e6c405a2f5d966',
  })
}
