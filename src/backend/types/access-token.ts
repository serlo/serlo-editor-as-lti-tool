import * as t from 'io-ts'

export const AccessTokenType = t.type({
  entityId: t.number,
  accessRight: t.union([t.literal('read'), t.literal('write')]),
})

export type AccessToken = t.TypeOf<typeof AccessTokenType>
