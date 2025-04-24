import * as t from 'io-ts'

export const LtiCustomClaimType = t.intersection([
  t.type({
    id: t.string,
  }),
  t.partial({
    type: t.string,
    createdbyuser: t.string,
  }),
])

export type LtiCustomClaim = t.TypeOf<typeof LtiCustomClaimType>
