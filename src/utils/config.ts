import * as t from 'io-ts'
import { failure } from 'io-ts/lib/PathReporter'
import { logger } from './logger'

// See https://github.com/gcanti/io-ts-types/blob/master/src/NonEmptyString.ts
const NonEmptyString = new t.Type<string, string, unknown>(
  'NonEmptyString',
  t.string.is,
  (input, context) => {
    if (t.string.is(input) && input.length > 0) {
      return t.success(input)
    }
    return t.failure(input, context)
  },
  String
)

const BooleanOrUndefined = new t.Type<boolean | undefined, string, unknown>(
  'BooleanOrUndefined',
  t.union([t.boolean, t.undefined]).is,
  (input, context) => {
    if (t.undefined.is(input) || input === '') {
      return t.success(undefined)
    }
    if (t.string.is(input) && (input === 'true' || input === 'false')) {
      return t.success(input === 'true')
    }
    return t.failure(input, context)
  },
  String
)

const BaseEnv = {
  EDITOR_URL: NonEmptyString,
  SERLO_EDITOR_TESTING_SECRET: t.string,
  LTIJS_KEY: NonEmptyString,
  MYSQL_URI: t.union([t.string, t.undefined]),
  IS_EDUSHARING_DEPLOYMENT: BooleanOrUndefined,
  MONGODB_URI: NonEmptyString,
  S3_ENDPOINT: NonEmptyString,
  BUCKET_NAME: NonEmptyString,
  BUCKET_REGION: NonEmptyString,
  BUCKET_ACCESS_KEY_ID: NonEmptyString,
  BUCKET_SECRET_ACCESS_KEY: NonEmptyString,
  MEDIA_BASE_URL: NonEmptyString,
}

const LocalEnvType = t.type({
  ...BaseEnv,
  ENVIRONMENT: t.literal('local'),
})

const DevelopmentEnvType = t.type({
  ...BaseEnv,
  ENVIRONMENT: t.literal('development'),
  MOODLE_NAME: NonEmptyString,
  MOODLE_URL: NonEmptyString,
  MOODLE_AUTHENTICATION_ENDPOINT: NonEmptyString,
  MOODLE_ACCESS_TOKEN_ENDPOINT: NonEmptyString,
  MOODLE_KEYSET_ENDPOINT: NonEmptyString,
  SERLO_EDITOR_CLIENT_ID_ON_MOODLE: NonEmptyString,
})

const StagingEnvType = t.type({
  ...BaseEnv,
  ENVIRONMENT: t.literal('staging'),
  ITSLEARNING_NAME: NonEmptyString,
  ITSLEARNING_URL: NonEmptyString,
  ITSLEARNING_AUTHENTICATION_ENDPOINT: NonEmptyString,
  ITSLEARNING_ACCESS_TOKEN_ENDPOINT: NonEmptyString,
  ITSLEARNING_KEYSET_ENDPOINT: NonEmptyString,
  SERLO_EDITOR_CLIENT_ID_ON_ITSLEARNING: NonEmptyString,
  EDUSHARING_RLP_URL: NonEmptyString,
  EDUSHARING_RLP_NAME: NonEmptyString,
  EDUSHARING_RLP_AUTHENTICATION_ENDPOINT: NonEmptyString,
  EDUSHARING_RLP_ACCESS_TOKEN_ENDPOINT: NonEmptyString,
  EDUSHARING_RLP_KEYSET_ENDPOINT: NonEmptyString,
  SERLO_EDITOR_CLIENT_ID_ON_EDUSHARING_RLP: NonEmptyString,
  EDUSHARING_RLP_LOGIN_ENDPOINT: NonEmptyString,
  EDUSHARING_RLP_LAUNCH_ENDPOINT: NonEmptyString,
  EDUSHARING_RLP_DETAILS_ENDPOINT: NonEmptyString,
  EDUSHARING_RLP_CLIENT_ID_ON_SERLO_EDITOR: NonEmptyString,
  // currently only for staging, in the future also or only for production
  OPENAI_API_KEY: NonEmptyString,
})

const ProductionEnvType = t.type({
  ...BaseEnv,
  ENVIRONMENT: t.literal('production'),
})

const IOEnv = t.union([
  LocalEnvType,
  DevelopmentEnvType,
  StagingEnvType,
  ProductionEnvType,
])

const decodedConfig = IOEnv.decode(process.env)

if (decodedConfig._tag === 'Left') {
  throw new Error(
    'Config validation errors: ' + failure(decodedConfig.left).join('\n')
  )
}

const config = decodedConfig.right

if (!config.MYSQL_URI && !config.IS_EDUSHARING_DEPLOYMENT) {
  throw new Error(
    'Either MYSQL_URI is set or IS_EDUSHARING_DEPLOYMENT is set to true'
  )
}

if (config.MYSQL_URI && config.IS_EDUSHARING_DEPLOYMENT) {
  logger.info(
    'MYSQL_URI and IS_EDUSHARING_DEPLOYMENT are both set! Notice that the data are going to be stored ONLY at Edusharing.'
  )
}

export default config
