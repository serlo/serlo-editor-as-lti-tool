import * as t from 'io-ts'

export const EdusharingLtiCustomClaimType = t.intersection([
  t.type({
    getContentApiUrl: t.string,
    appId: t.string,
    dataToken: t.string,
    nodeId: t.string,
    user: t.string,
  }),
  t.partial({
    fileName: t.string,
    /** Is set when editor was opened in edit mode */
    postContentApiUrl: t.string,
    version: t.string,
  }),
])
