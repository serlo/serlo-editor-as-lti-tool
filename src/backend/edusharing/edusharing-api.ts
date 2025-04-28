import { Response } from 'express'
import { IdToken } from '../types/idtoken'
import { getEdusharingInfo } from './get-edusharing-info'
import jwt from 'jsonwebtoken'
import { createAndLogError } from '../../utils/logger'
import type { GetEntityBody } from '../../frontend/types/get-entity-body'

export const edusharingApi = {
  async getEntity(idToken: IdToken, custom: unknown): Promise<GetEntityBody> {
    const {
      appId,
      dataToken,
      keyId,
      nodeId,
      version,
      privateKey,
      user,
      getContentApiUrl,
    } = await getEdusharingInfo(idToken, custom)

    const payload = {
      appId,
      nodeId,
      user,
      ...(version != null ? { version } : {}),
      dataToken,
    }
    const message = jwt.sign(payload, privateKey, {
      keyid: keyId,
      algorithm: 'RS256',
    })

    const url = new URL(getContentApiUrl)
    url.searchParams.append('jwt', message)

    const edusharingResponse = await fetch(url.href)

    if (!edusharingResponse.ok)
      throw createAndLogError('Getting entity from edu-sharing failed')

    const stringifiedDocumentState = await edusharingResponse.text()

    const noContent = stringifiedDocumentState.length === 0

    return {
      id: nodeId,
      content: noContent ? null : stringifiedDocumentState,
    }
  },
  async putContent(contentString: string, res: Response) {
    const {
      appId,
      dataToken,
      keyId,
      nodeId,
      postContentApiUrl,
      privateKey,
      user,
    } = await getEdusharingInfo(
      res.locals.token as IdToken,
      res.locals.context?.custom
    )

    if (!postContentApiUrl) {
      createAndLogError(`Saving to edu-sharing: postContentApiUrl was missing`)
      return
    }

    const payload = {
      appId,
      nodeId,
      user,
      dataToken,
    }
    const message = jwt.sign(payload, privateKey, {
      keyid: keyId,
      algorithm: 'RS256',
    })

    const url = new URL(postContentApiUrl)
    url.searchParams.append('jwt', message)
    url.searchParams.append('mimetype', 'application/json')
    url.searchParams.append('versionComment', 'Automatische Speicherung')

    const blob = new Blob([contentString], {
      type: 'application/json',
    })

    const data = new FormData()
    data.set('file', blob)

    const response = await fetch(url.href, {
      method: 'POST',
      body: data,
    })

    if (!response.ok) {
      createAndLogError(
        `Saving to edu-sharing: Fetch failed with status ${response.status} and body ${JSON.stringify(response.body)}`
      )
      return
    }
  },
}
