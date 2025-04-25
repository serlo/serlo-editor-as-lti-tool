import { NextFunction, Request, Response } from 'express'
import { edusharingApi } from './edusharing-api'
import { IdToken } from '../types/idtoken'
import { createAndLogError } from '../../utils/logger'
import { EdusharingLtiCustomClaimType } from '../types/edu-sharing-lti-custom-claim'
import { GetEntityBody } from '../../frontend/types/get-entity-body'
import { checkAccessToken } from '../check-access-token'

export async function getEntity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { entityId } = checkAccessToken(req)

    const custom: unknown = res.locals.context?.custom
    if (!EdusharingLtiCustomClaimType.is(custom))
      throw createAndLogError(
        `Unexpected type of edu-sharing LTI custom. Got: ${JSON.stringify(custom)}`
      )

    if (entityId !== custom.nodeId)
      throw createAndLogError(
        `Access token entityId=${entityId} does not match custom.nodeId=${custom.nodeId}`
      )

    const idToken = res.locals.token as IdToken

    const entity: GetEntityBody | null = await edusharingApi.tryGetEntity(
      idToken,
      custom
    )

    if (!entity)
      throw createAndLogError('Failed to get entity from edu-sharing')

    res.json(entity)
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}

export async function putEntity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { entityId, accessRight } = checkAccessToken(req)

    if (accessRight !== 'write')
      throw createAndLogError("Access token does not grant 'write' permission")

    const custom: unknown = res.locals.context?.custom
    if (!EdusharingLtiCustomClaimType.is(custom))
      throw createAndLogError(
        `Unexpected type of edu-sharing LTI custom. Got: ${JSON.stringify(custom)}`
      )

    if (entityId !== custom.nodeId)
      throw createAndLogError(
        `Access token entityId=${entityId} does not match custom.nodeId=${custom.nodeId}`
      )

    const contentString = JSON.stringify(req.body.editorState)

    await edusharingApi.putEntity(contentString, res)

    res.sendStatus(200)
  } catch (error) {
    // Forward error to express to handle error without crashing
    // See: https://expressjs.com/en/guide/error-handling.html
    next(error)
  }
}
