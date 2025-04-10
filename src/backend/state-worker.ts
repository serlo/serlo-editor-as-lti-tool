import config from '../utils/config'
import { getEdusharingApiHandler } from './edusharing/api-handler'
import { getMariaDB } from './mariadb'
import { Entity } from './types/entity'

type StateWorker = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createOrGetEntity: (...args: any[]) => Promise<Entity>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getEntity: (...args: any[]) => Promise<void>
}

export function getStateWorker(): StateWorker {
  if (config.IS_EDUSHARING_DEPLOYMENT) {
    return getEdusharingApiHandler()
  }

  return getMariaDB()
}
