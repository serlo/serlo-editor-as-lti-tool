import { Request, Response } from 'express'

import jwt from 'jsonwebtoken'
import path from 'path'
import { AccessToken, Entity } from '.'
import { getMysqlDatabase } from './mysql-database'
import config from '../utils/config'

const ltijsKey = config.LTIJS_KEY

export async function editorApp(_: Request, res: Response) {
  return res.sendFile(path.join(__dirname, '../../dist/frontend/index.html'))
}

export async function editorGetEntity(req: Request, res: Response) {
  const database = getMysqlDatabase()

  const accessToken = req.query.accessToken
  if (typeof accessToken !== 'string') {
    return res.send('Missing or invalid access token')
  }

  const decodedAccessToken = jwt.verify(accessToken, ltijsKey) as AccessToken

  // Get json from database with decodedAccessToken.entityId
  const entity = await database.fetchOptional<Entity | null>(
    `
      SELECT
        id,
        resource_link_id,
        custom_claim_id,
        content
      FROM
        lti_entity
      WHERE
        id = ?
    `,
    [String(decodedAccessToken.entityId)]
  )

  console.log('entity: ', entity)

  res.json(entity)
}

export async function editorPutEntity(req: Request, res: Response) {
  const database = getMysqlDatabase()

  const accessToken = req.body.accessToken
  if (typeof accessToken !== 'string') {
    return res.send('Missing or invalid access token')
  }

  const decodedAccessToken = jwt.verify(accessToken, ltijsKey) as AccessToken

  if (decodedAccessToken.accessRight !== 'write') {
    return res.send('Access token grants no right to modify content')
  }

  // Modify entity with decodedAccessToken.entityId in database
  await database.mutate('UPDATE lti_entity SET content = ? WHERE id = ?', [
    req.body.editorState,
    decodedAccessToken.entityId,
  ])
  console.log(
    `Entity ${
      decodedAccessToken.entityId
    } modified in database. New state:\n${req.body.editorState}`
  )

  return res.send('Success')
}
