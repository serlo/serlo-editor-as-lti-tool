import {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
  createPool,
} from 'mysql2/promise'

import { type Entity } from '.'
import config from '../utils/config'

const editorUrl = config.EDITOR_URL

let database: Database | null = null

export function getMysqlDatabase() {
  if (database === null) {
    database = new Database(createPool(config.MYSQL_URI))
  }
  return database
}

export async function initMysqlDatabase() {
  const database = getMysqlDatabase()

  // Create table if necessary
  await database.mutate(
    `
    CREATE TABLE IF NOT EXISTS lti_entity (
      id bigint NOT NULL AUTO_INCREMENT, 
      resource_link_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, 
      custom_claim_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL,
      edusharing_node_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, 
      content longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, 
      id_token_on_creation text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_520_ci NOT NULL, 
      
      PRIMARY KEY (id), 
      KEY idx_lti_entity_custom_claim_id (custom_claim_id),
      KEY idx_lti_entity_edusharing_node_id (edusharing_node_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
    `
  )

  const notProductionEnvironment =
    config.ENVIRONMENT === 'local' ||
    editorUrl === 'https://editor.serlo-staging.dev/' ||
    editorUrl === 'https://editor.serlo.dev/'

  if (notProductionEnvironment) {
    // Make sure there is an entity with a fixed ID in database to simplify development
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
        custom_claim_id = ?
    `,
      ['00000000-0000-0000-0000-000000000000']
    )
    if (!entity) {
      await database.mutate(
        'INSERT INTO lti_entity (custom_claim_id, id_token_on_creation) values (?, ?)',
        ['00000000-0000-0000-0000-000000000000', JSON.stringify({})]
      )
    }
  }
}

export class Database {
  private state: DatabaseState
  private pool: Pool

  constructor(pool: Pool) {
    this.pool = pool
    this.state = { type: 'OutsideOfTransaction' }
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
      `Failed to execute command in mysql database after ${numberOfTries} tries.`
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
