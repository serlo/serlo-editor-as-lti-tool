import * as t from 'io-ts'

export const GetEntityBodyType = t.type({
  id: t.string,
  content: t.union([t.string, t.null]),
})

export type GetEntityBody = t.TypeOf<typeof GetEntityBodyType>
