import { Provider as ltijs } from 'ltijs'
import { edusharingMockClientId } from '../edusharing-mock/server'
import { edusharingAsToolConfigs } from './edusharing/get-edusharing-as-tool-configuration'
import { serverLog } from '../utils/server-log'
import config from '../utils/config'

export async function registerLtiPlatforms() {
  // Register platform: saltire
  if (config.ALLOW_SALTIRE) {
    await ltijs.registerPlatform({
      url: 'https://saltire.lti.app/platform', // LTI iss
      name: 'saltire.lti.app',
      clientId: 'saltire.lti.app',
      authenticationEndpoint: 'https://saltire.lti.app/platform/auth',
      accesstokenEndpoint:
        'https://saltire.lti.app/platform/token/sc24671cd70c6e45554e6c405a2f5d966',
      authConfig: {
        method: 'JWK_SET',
        key: 'https://saltire.lti.app/platform/jwks/sc24671cd70c6e45554e6c405a2f5d966',
      },
    })
    serverLog(`Registered platform: saltire`)
  }

  // Register platform: itslearning
  if (config.ENVIRONMENT === 'staging') {
    const { ITSLEARNING_URL } = config
    const itsLearningPlatform = await ltijs.registerPlatform({
      url: ITSLEARNING_URL, // LTI iss
      name: 'itslearning.com',
      clientId: config.SERLO_EDITOR_CLIENT_ID_ON_ITSLEARNING,
      authenticationEndpoint: ITSLEARNING_URL + '/connect/authorize',
      accesstokenEndpoint: ITSLEARNING_URL + '/connect/token',
      authConfig: {
        method: 'JWK_SET',
        key: ITSLEARNING_URL + '/.well-known/openid-configuration/jwks',
      },
    })
    if (itsLearningPlatform) {
      serverLog('Registered platform: itslearning')
    }

    // Register platform: edu-sharing (RLP)
    const { EDUSHARING_RLP_URL } = config
    const edusharingRlpUrlWithPrefixes =
      EDUSHARING_RLP_URL + '/edu-sharing/rest'
    const edusharingRlpKeySetUrl =
      edusharingRlpUrlWithPrefixes + '/lti/v13/jwks'

    const eduSharingPlatform = await ltijs.registerPlatform({
      url: EDUSHARING_RLP_URL, // LTI iss
      name: EDUSHARING_RLP_URL,
      clientId: config.SERLO_EDITOR_CLIENT_ID_ON_EDUSHARING_RLP,
      authenticationEndpoint:
        edusharingRlpUrlWithPrefixes + '/ltiplatform/v13/auth',
      accesstokenEndpoint:
        edusharingRlpUrlWithPrefixes + '/ltiplatform/v13/token',
      authConfig: {
        method: 'JWK_SET',
        key: edusharingRlpKeySetUrl,
      },
    })
    if (eduSharingPlatform) {
      edusharingAsToolConfigs.push({
        issWhenEdusharingLaunchedSerloEditor: EDUSHARING_RLP_URL,
        loginEndpoint:
          edusharingRlpUrlWithPrefixes + '/lti/v13/oidc/login_initiations',
        launchEndpoint: edusharingRlpUrlWithPrefixes + '/lti/v13/lti13',
        clientId: config.EDUSHARING_RLP_CLIENT_ID_ON_SERLO_EDITOR,
        detailsEndpoint: edusharingRlpUrlWithPrefixes + '/lti/v13/detail',
        keysetEndpoint: edusharingRlpKeySetUrl,
      })
      serverLog('Registered platform: edu-sharing (RLP)')
    }
  }

  // Register platform: edusharing mock
  if (config.ALLOW_EDUSHARING_MOCK) {
    const platform = await ltijs.registerPlatform({
      url: 'http://localhost:8100/edu-sharing', // LTI iss
      name: 'edusharing-mock',
      clientId: 'piQ0JV8O880ZrVt', // The ID for this LTI tool on the LTI platform
      authenticationEndpoint:
        'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/auth',
      accesstokenEndpoint:
        'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/token',
      authConfig: {
        method: 'JWK_SET',
        key: 'http://localhost:8100/edu-sharing/rest/lti/v13/jwks',
      },
    })
    edusharingAsToolConfigs.push({
      issWhenEdusharingLaunchedSerloEditor: 'http://localhost:8100/edu-sharing',
      loginEndpoint:
        'http://localhost:8100/edu-sharing/rest/lti/v13/oidc/login_initiations',
      launchEndpoint: 'http://localhost:8100/edu-sharing/rest/lti/v13/lti13',
      clientId: edusharingMockClientId,
      detailsEndpoint: 'http://localhost:8100/edu-sharing/rest/lti/v13/details',
      keysetEndpoint: 'http://localhost:8100/edu-sharing/rest/lti/v13/jwks',
    })
    if (platform) {
      serverLog(`Registered platform: edusharing-mock`)
    }
  }

  // Register platform: edusharing (local docker)
  // if (config.ALLOW_LOCAL_EDUSHARING) {
  //   const platform = await ltijs.registerPlatform({
  //     url: 'http://localhost:8100/edu-sharing', // LTI iss
  //     name: 'Platform', // TODO: Change
  //     clientId: 'aZZDRp40gsj459a', // The ID for this LTI tool on the LTI platform
  //     authenticationEndpoint:
  //       'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/auth',
  //     accesstokenEndpoint:
  //       'http://localhost:8100/edu-sharing/rest/ltiplatform/v13/token',
  //     authConfig: {
  //       method: 'JWK_SET',
  //       // key: 'http://localhost:8100/edu-sharing/rest/lti/v13/jwks',
  //       key: 'https://serlo-edusharing_repository-service_1:8080/edu-sharing/rest/lti/v13/jwks',
  //       // key: 'http://repository-service:8080/edu-sharing/rest/lti/v13/jwks',
  //     },
  //   })
  //   if (platform) {
  //     serverLog(`Registered platform: edusharing-local-docker`)
  //   }
  // }
}
