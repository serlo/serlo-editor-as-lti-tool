import * as t from 'io-ts'

export const LtiEntityType = t.type({
  id: t.number,
  lti_platform: t.string,
  lti_resource_link_id: t.string,
  lti_user_when_first_opened: t.string,
  content: t.union([t.string, t.null]),
  lti_custom_claim_id: t.union([t.string, t.null]),
  lti_user_when_created: t.union([t.string, t.null]),
  edusharing_node_id: t.union([t.string, t.null]),
})

export type LtiEntity = t.TypeOf<typeof LtiEntityType>
