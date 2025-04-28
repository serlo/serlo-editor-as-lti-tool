import {
  type RowDataPacket,
  type ResultSetHeader,
  createPool,
} from 'mysql2/promise'
import config from '../utils/config'
import { IdToken } from './types/idtoken'
import * as t from 'io-ts'
import { LtiEntityType } from './types/entity'
import path from 'path'
import { readFile } from 'fs/promises'
import { LtiCustomClaimType } from './types/lti-custom-claim'
import { createAndLogError } from '../utils/logger'
import { edusharingApi } from './edusharing/edusharing-api'

const isInitialized = false

if (!config.MYSQL_URI) throw createAndLogError('MYSQL_URI is missing')
const pool = createPool(config.MYSQL_URI)

const mariaDb = {
  async createOrGetEntity({
    custom,
    idToken,
    platform,
    resourceLinkId,
    user,
  }: {
    custom: unknown
    idToken: IdToken
    platform: string
    resourceLinkId: string
    user: string
  }) {
    const userWhenCreated = LtiCustomClaimType.is(custom)
      ? custom.createdbyuser
      : undefined

    // Check if there is already a database entry
    const [selectExistingEntityRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM lti_entity WHERE lti_resource_link_id = ? AND lti_platform = ?',
      [resourceLinkId, platform]
    )

    if (selectExistingEntityRows.length > 1)
      throw createAndLogError(
        `Found multiple entities in database with lti_resource_link_id=${resourceLinkId} and lti_platform=${platform}`
      )

    const existingEntity = selectExistingEntityRows.at(0)

    if (existingEntity) {
      if (!LtiEntityType.is(existingEntity))
        throw createAndLogError(
          `Unexpected type retrieved from mariadb entity. Got: ${JSON.stringify(existingEntity)}`
        )

      return { ...existingEntity, id: existingEntity.id.toString() }
    }

    // If on edu-sharing and if we do not find an existing entity in our database we need to check if this either:
    // (A) A new entity
    // (B) A copy of an existing entity on edu-sharing
    // Here, we try to get an existing entity from edu-sharing. If none exists, we have (A) and set the initial content to null. If one exists, we have (B) and use the state to initialize the new entity in our database.
    // This is a workaround for a known limitation in LTI. See: https://www.imsglobal.org/lti-course-copy-road-nowhere
    const initialContent = await getInitialContent(platform, idToken, custom)
    async function getInitialContent(
      platform: string,
      idToken: IdToken,
      custom: unknown
    ) {
      if (!platform.includes('edu-sharing')) {
        return null
      }

      try {
        const entity = await edusharingApi.getEntity(idToken, custom)
        return entity.content
      } catch {
        return null
      }
    }

    const customClaimId = t.type({ id: t.string }).is(custom) ? custom.id : null
    const edusharingNodeId = t.type({ nodeId: t.string }).is(custom)
      ? custom.nodeId
      : null

    // If there is no existing entity, create one
    const [resultSetHeader] = await pool.query<ResultSetHeader>(
      'INSERT INTO lti_entity (lti_platform, lti_resource_link_id, lti_custom_claim_id, edusharing_node_id, content, lti_user_when_first_opened, lti_user_when_created) values (?, ?, ?, ?, ?, ?, ?)',
      [
        platform,
        resourceLinkId,
        customClaimId,
        edusharingNodeId,
        initialContent,
        user,
        userWhenCreated,
      ]
    )

    const [selectInsertedEntityRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM lti_entity WHERE id = ?',
      [resultSetHeader.insertId]
    )

    const insertedEntity = selectInsertedEntityRows.at(0)

    if (!insertedEntity)
      throw createAndLogError('Failed to insert entity into mariadb')

    if (!LtiEntityType.is(insertedEntity))
      throw createAndLogError(
        `Unexpected type retrieved from mariadb entity. Got: ${JSON.stringify(insertedEntity)}`
      )

    return { ...insertedEntity, id: insertedEntity.id.toString() }
  },
  async getEntity(id: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `
        SELECT
          *
        FROM
          lti_entity
        WHERE
          id = ?
      `,
      [String(id)]
    )

    const entity = rows.at(0)

    if (!entity) throw createAndLogError(`Did not find entity with id=${id}`)

    if (!LtiEntityType.is(entity))
      throw createAndLogError(
        `Unexpected type retrieved from mariadb entity. Got: ${JSON.stringify(entity)}`
      )

    return { ...entity, id: entity.id.toString() }
  },
  async setContent(id: number, content: string) {
    await pool.query<ResultSetHeader>(
      'UPDATE lti_entity SET content = ? WHERE id = ?',
      [content, id]
    )
  },
}

export async function getMariaDb() {
  if (!isInitialized) {
    // Create tables if not exist
    const initSql = await readFile(
      path.join(__dirname, '../../db/createTablesIfNotExist.sql'),
      'utf-8'
    )
    await pool.query(initSql)
  }

  return mariaDb
}
