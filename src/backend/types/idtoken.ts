// Hard coded type because the type provided by @types/ltijs is outdated

import { LtiCustomClaim } from './lti-custom-claim'

// TODO: Use type provided by ltijs instead once it is included or extend this one with additional properties
export interface IdToken {
  platformContext?: {
    custom?: LtiCustomClaim
    resource?: {
      id?: string
      title?: string
    }
    roles?: string[]
    context?: {
      title?: string
    }
  }
  iss: string
}
