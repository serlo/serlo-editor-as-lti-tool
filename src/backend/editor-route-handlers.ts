import { NextFunction, Request, Response } from 'express'

import jwt from 'jsonwebtoken'
import path from 'path'
import { getMariaDb } from './mariadb'
import config from '../utils/config'
import { createAndLogError } from '../utils/logger'
import urljoin from 'url-join'
import { v4 as uuid_v4 } from 'uuid'

import { Provider as ltijs } from 'ltijs'
import { IdToken } from './types/idtoken'
import { LtiCustomClaim } from './types/lti-custom-claim'
import * as t from 'io-ts'
import { createAccessToken } from './util/create-acccess-token'
import { AccessTokenType } from './types/access-token'
import { saveEntityInEdusharing } from './edusharing/api-handler'
import { getStateWorker } from './state-worker'

const ltijsKey = config.LTIJS_KEY

export function app(_: Request, res: Response) {
  return res.sendFile(path.join(__dirname, '../../dist/frontend/index.html'))
}

export async function deeplinkingDone(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const idToken = res.locals.token

    if (!idToken) throw createAndLogError('Missing idToken')

    const ltiCustomClaimId = uuid_v4()

    const url = new URL(urljoin(config.EDITOR_URL, '/lti/launch'))

    const custom: LtiCustomClaim = {
      // Important: Only use lowercase letters in key. When I used uppercase letters they were changed to lowercase letters in the LTI Resource Link launch on itslearning.
      id: ltiCustomClaimId,
      type: req.query['type']?.toString(),
      createdbyuser: idToken.user,
    }

    // https://www.imsglobal.org/spec/lti-dl/v2p0#lti-resource-link
    const items = [
      {
        type: 'ltiResourceLink',
        url: url.href,
        title: `Serlo Editor Content`,
        text: 'Placeholder description',
        icon: {
          url: 'https://editor.serlo.dev/media/serlo-org/skkwa1vksa3v2yc7bj9z0bni/image.png',
          width: 500,
          height: 500,
        },
        // thumbnail:
        // window:
        // iframe: {
        //   width: 400,
        //   height: 300,
        // },
        custom,
        // lineItem:
        // available:
        // submission:

        // Custom properties
        // presentation: {
        //   documentTarget: "iframe",
        // },
      },
    ]

    // Creates the deep linking request form
    const form = await ltijs.DeepLinking.createDeepLinkingForm(
      idToken,
      items,
      {}
    )

    return res.send(form)
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}

export async function onConnect(
  idToken: IdToken,
  _: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Unique id for a serlo editor resource link on the platform
    const resourceLinkId = idToken.platformContext?.resource?.id
    if (!resourceLinkId)
      throw createAndLogError(
        'resource_link.id missing in idToken during launch of Serlo editor'
      )

    // The LTI platform id
    const platform = idToken.iss
    if (!platform)
      throw createAndLogError(
        'iss missing in idToken during launch of Serlo editor'
      )

    // User id
    const user = idToken.user
    if (!user)
      throw createAndLogError(
        'sub missing in idToken during launch of Serlo editor'
      )

    const isEdusharing = platform.includes('edu-sharing')

    // On Moodle 4.5.1+ (Build: 20250124) and edu-sharing we don't have a LTI deep linking launch before this launch. So, we might not get any 'custom' values here.
    const custom: unknown = idToken.platformContext?.custom

    const customValid = isCustomValid(custom, isEdusharing)
    if (!customValid)
      throw createAndLogError(
        `Invalid LTI custom claim during launch of Serlo editor. Was: ${JSON.stringify(custom)}`
      )

    const stateWorker = getStateWorker()

    // First open -> Create new row in database
    // Not first open -> Get existing row in database
    const entity = await stateWorker.createOrGetEntity({
      custom,
      idToken,
      platform,
      resourceLinkId,
      user,
    })

    const editorMode = getEditorMode(idToken, custom, isEdusharing)

    const accessToken = createAccessToken(editorMode, entity.id, ltijsKey)

    const ltik = res.locals.ltik
    const title = idToken.platformContext?.resource?.title
    const contextTitle = idToken.platformContext?.context?.title

    const searchParams = new URLSearchParams()
    searchParams.append('accessToken', accessToken)
    searchParams.append('resourceLinkId', resourceLinkId)
    searchParams.append('testingSecret', config.SERLO_EDITOR_TESTING_SECRET)
    searchParams.append('ltik', ltik)
    searchParams.append('contextTitle', contextTitle ?? '')
    searchParams.append('title', title ?? '')

    // Open editor
    return ltijs.redirect(res, `/app?${searchParams.toString()}`)
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}

export async function onDeepLinking(
  _: IdToken,
  __: Request,
  res: Response,
  next: NextFunction
) {
  try {
    return res.send(`
      <!doctype html>
      <html lang="de">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Serlo Editor</title>
        <style>
          #clicktarget {
            display: block; width: 760px; height: 568px;
            background: url('https://editor.serlo.dev/media/serlo-org/fzinqkwqekgnx9jhgrazvfe4/image.svg')
              no-repeat center center;
            background-size: contain;
          }
            /* hide visually */
          #clicktarget span {
            border: 0; clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; white-space: nowrap; width: 1px;
          }
        </style>
      </head>
      <body style="margin:0; padding:0"><a id="clicktarget" href="/deeplinking-done?type=serlo-editor&ltik=${res.locals.ltik}"><span>Serlo Editor Inhalt (ohne Vorlage)</span></a></body>
    </html>
    `)
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}

function isCustomValid(custom: unknown, isEdusharing: boolean) {
  if (!isEdusharing) return true

  // edu-sharing only
  // We need these later in the edu-sharing plugin
  const expectedCustomType = t.intersection([
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
  return expectedCustomType.is(custom)
}

function getEditorMode(
  idToken: IdToken,
  custom: unknown,
  isEdusharing: boolean
) {
  if (isEdusharing) {
    return t.type({ postContentApiUrl: t.string }).is(custom) &&
      custom.postContentApiUrl
      ? 'write'
      : 'read'
  }

  // https://www.imsglobal.org/spec/lti/v1p3#lis-vocabulary-for-context-roles
  // Example roles claim from itslearning
  // "https://purl.imsglobal.org/spec/lti/claim/roles":[
  //   0:"http://purl.imsglobal.org/vocab/lis/v2/institution/person#Staff"
  //   1:"http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"
  // ]
  const rolesWithWriteAccess = [
    'membership#Administrator',
    'membership#ContentDeveloper',
    'membership#Instructor',
    'membership#Mentor',
    'membership#Manager',
    'membership#Officer',
    // This role is sent in the itslearning library and we disallow editing there for now
    // 'membership#Member',
  ]
  const courseMembershipRole = idToken.platformContext?.roles?.find((role) =>
    role.includes('membership#')
  )
  return courseMembershipRole &&
    rolesWithWriteAccess.some((roleWithWriteAccess) =>
      courseMembershipRole.includes(roleWithWriteAccess)
    )
    ? 'write'
    : 'read'
}

export async function getEntity() {
  return getStateWorker().getEntity()
}

export async function putEntity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!config.IS_EDUSHARING_DEPLOYMENT) {
      await saveEntityInOurDatabase(req)
    }

    // If we are on edu-sharing, we additionally save the entity to edu-sharing.
    // Why? When the user creates a copy of a Serlo Editor entity on edu-sharing and opens the new copy, our service does not know what other entity on edu-sharing was copied. But using this, it can fetch the content json from edu-sharing to initialize the state in our database.
    const idToken = res.locals.token as IdToken
    const isEdusharing = idToken.iss.includes('edu-sharing')
    if (isEdusharing) {
      saveEntityInEdusharing(req, res, idToken)
        // Do not forward error to express. To the user, a failed save to edu-sharing is still considered successful.
        .catch(() => {})
    }

    res.sendStatus(200)
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}

async function saveEntityInOurDatabase(req: Request) {
  const messagePrefix = 'Saving entity to database'

  const accessToken = req.body.accessToken
  if (typeof accessToken !== 'string')
    throw createAndLogError(`${messagePrefix}: Missing access token`)

  const decodedAccessToken = jwt.verify(accessToken, ltijsKey)

  if (!AccessTokenType.is(decodedAccessToken))
    throw createAndLogError(
      `${messagePrefix}: Access token malformed. Was: ${JSON.stringify(decodedAccessToken)}`
    )

  if (decodedAccessToken.accessRight !== 'write')
    throw createAndLogError(
      `${messagePrefix}: Access token grants no right to modify content`
    )

  const mariaDb = await getMariaDb()

  // Modify entity with decodedAccessToken.entityId in database
  await mariaDb.setContent(
    decodedAccessToken.entityId,
  ])
}
