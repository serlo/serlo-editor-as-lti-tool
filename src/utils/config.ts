import * as t from 'io-ts'
import { failure } from 'io-ts/lib/PathReporter'

// Inspiration from https://github.com/gcanti/io-ts-types/blob/master/src/BooleanFromString.ts
const StringOrUndefinedToBoolean = new t.Type<boolean, string, unknown>(
  'StringOrUndefinedToBoolean',
  t.boolean.is,
  (input, context) => {
    if (input === 'true') {
      return t.success(true)
    }
    if (!input || input === 'false') {
      return t.success(false)
    }
    return t.failure(input, context)
  },
  String
)

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

const IOEnv = t.type({
  ENVIRONMENT: t.union([
    t.literal('local'),
    t.literal('development'),
    t.literal('staging'),
    t.literal('production'),
  ]),
  EDITOR_URL: NonEmptyString,
  SERLO_EDITOR_TESTING_SECRET: t.string,
  LTIJS_KEY: NonEmptyString,
  MYSQL_URI: NonEmptyString,
  MONGODB_URI: NonEmptyString,
  ALLOW_SALTIRE: StringOrUndefinedToBoolean,
  ALLOW_EDUSHARING_MOCK: StringOrUndefinedToBoolean,
  S3_ENDPOINT: NonEmptyString,
  BUCKET_NAME: NonEmptyString,
  BUCKET_REGION: NonEmptyString,
  // fallback to '' for now so it does not fail in CI
  BUCKET_ACCESS_KEY_ID: t.string,
  // fallback to '' for now so it does not fail in CI
  BUCKET_SECRET_ACCESS_KEY: t.string,
  MEDIA_BASE_URL: NonEmptyString,
})

const decodedConfig = IOEnv.decode(process.env)

if (decodedConfig._tag === 'Left') {
  throw new Error(
    'Config validation errors: ' + failure(decodedConfig.left).join('\n')
  )
}

const config = decodedConfig.right

export default config
