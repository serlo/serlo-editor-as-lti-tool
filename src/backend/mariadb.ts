import {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
  createPool,
} from 'mysql2/promise'
import config from '../utils/config'
import { type Entity } from '.'
import { IdToken } from './types/idtoken'
import * as t from 'io-ts'

let database: Database | null = null

export function getMariaDB() {
  if (database === null) {
    database = new Database(createPool(config.MYSQL_URI))
  }
  return database
}

export class Database {
  private state: DatabaseState
  private pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
    this.state = { type: 'OutsideOfTransaction' }
  }

  public async createOrGetEntity({
    custom,
    idToken,
    iss,
    resourceLinkId,
    user,
  }: {
    custom: unknown
    idToken: IdToken
    iss: string
    resourceLinkId: string
    user: string
  }) {
    const mariaDB = getMariaDB()

    // Only exists when there was a LTI deep linking launch before
    const idTokenWhenCreated = t
      .type({ deeplinkingidtoken: t.string })
      .is(custom)
      ? custom.deeplinkingidtoken
      : null

    // Check if there is already a database entry with (iss, resource_link_id)
    const existingEntity = await mariaDB.fetchOptional<Entity | null>(
      'SELECT * FROM lti_entity WHERE resource_link_id = ? AND iss = ?',
      [resourceLinkId, iss]
    )
    if (existingEntity) {
      return existingEntity
    }

    const customClaimId = t.type({ id: t.string }).is(custom) ? custom.id : null
    const edusharingNodeId = t.type({ nodeId: t.string }).is(custom)
      ? custom.nodeId
      : null

    // If there is no existing entity, create one
    const insertionResult = await mariaDB.mutate(
      'INSERT INTO lti_entity (iss, resource_link_id, custom_claim_id, edusharing_node_id, user_when_first_opened, id_token_when_first_opened, id_token_when_created) values (?, ?, ?, ?, ?, ?, ?)',
      [
        iss,
        resourceLinkId,
        customClaimId,
        edusharingNodeId,
        user,
        JSON.stringify(idToken),
        idTokenWhenCreated,
      ]
    )

    const insertedEntity = await mariaDB.fetchOne<Entity>(
      'SELECT * FROM lti_entity WHERE id = ?',
      [insertionResult.insertId]
    )
    return insertedEntity
  }

  public async beginTransaction() {
    if (this.state.type === 'OutsideOfTransaction') {
      const transaction = await this.pool.getConnection()
      await transaction.beginTransaction()

      this.state = { type: 'InsideTransaction', transaction }
    } else {
      const { transaction } = this.state
      const newDepth =
        this.state.type === 'InsideSavepoint' ? this.state.depth + 1 : 0

      await transaction.query(`SAVEPOINT _savepoint_${newDepth}`)

      this.state = { type: 'InsideSavepoint', transaction, depth: newDepth }
    }

    let isComittedOrRollbacked = false

    return {
      commit: async () => {
        if (!isComittedOrRollbacked) {
          await this.commitLastTransaction()
          isComittedOrRollbacked = true
        }
      },
      rollback: async () => {
        if (!isComittedOrRollbacked) {
          await this.rollbackLastTransaction()
          isComittedOrRollbacked = true
        }
      },
    }
  }

  private async commitLastTransaction() {
    if (this.state.type === 'OutsideOfTransaction') return

    const { transaction } = this.state

    if (this.state.type === 'InsideTransaction') {
      await transaction.commit()
      transaction.release()

      this.state = { type: 'OutsideOfTransaction' }
    } else {
      const { depth } = this.state

      await transaction.query(`RELEASE SAVEPOINT _savepoint_${depth}`)

      this.state =
        depth > 0
          ? { type: 'InsideSavepoint', transaction, depth: depth - 1 }
          : { type: 'InsideTransaction', transaction }
    }
  }

  private async rollbackLastTransaction() {
    if (this.state.type === 'OutsideOfTransaction') return

    const { transaction } = this.state

    if (this.state.type === 'InsideTransaction') {
      await this.rollbackAllTransactions()
    } else {
      const { depth } = this.state

      await transaction.query(`ROLLBACK TO SAVEPOINT _savepoint_${depth}`)

      this.state =
        depth > 0
          ? { type: 'InsideSavepoint', transaction, depth: depth - 1 }
          : { type: 'InsideTransaction', transaction }
    }
  }

  public async rollbackAllTransactions() {
    if (this.state.type === 'OutsideOfTransaction') return

    const { transaction } = this.state

    await transaction.rollback()
    transaction.release()

    this.state = { type: 'OutsideOfTransaction' }
  }

  public async fetchAll<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    return this.execute<(T & RowDataPacket)[]>(sql, params)
  }

  public async fetchOptional<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<T | null> {
    const [result] = await this.execute<(T & RowDataPacket)[]>(sql, params)

    return result ?? null
  }

  public async fetchOne<T = unknown>(
    sql: string,
    params?: unknown[]
  ): Promise<T> {
    const result = await this.fetchOptional<T>(sql, params)

    if (result == null) throw new Error('Expected one row, no row found')

    return result
  }

  public async mutate(
    sql: string,
    params?: unknown[]
  ): Promise<ResultSetHeader> {
    return this.execute<ResultSetHeader>(sql, params)
  }

  public async close() {
    await this.pool.end()
  }

  private async execute<T extends RowDataPacket[] | ResultSetHeader>(
    sql: string,
    params?: unknown[]
  ): Promise<T> {
    const numberOfTries = 10
    const waitTime = 1000
    for (let i = 0; i < numberOfTries; i++) {
      try {
        if (this.state.type === 'OutsideOfTransaction') {
          const [rows] = await this.pool.execute<T>(sql, params)

          return rows
        } else {
          const [rows] = await this.state.transaction.execute<T>(sql, params)

          return rows
        }
      } catch {
        await new Promise((res) => setTimeout(res, waitTime))
      }
    }
    throw new Error(
      `Failed to execute command in mariadb database after ${numberOfTries} tries.`
    )
  }
}

type DatabaseState = OutsideOfTransaction | InsideTransaction | InsideSavepoint

interface OutsideOfTransaction {
  type: 'OutsideOfTransaction'
}

interface InsideTransaction {
  type: 'InsideTransaction'
  transaction: PoolConnection
}

interface InsideSavepoint {
  type: 'InsideSavepoint'
  transaction: PoolConnection
  depth: number
}
