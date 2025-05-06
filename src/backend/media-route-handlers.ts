import { createId } from '@paralleldrive/cuid2'
import * as t from 'io-ts'
import {
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createProxyMiddleware } from 'http-proxy-middleware'
import type { NextFunction, Request, Response } from 'express'
import config from '../utils/config'
import { createAndLogError } from '../utils/logger'

export function tryGetMediaHandlers() {
  if (config.ENVIRONMENT === 'edusharing') return null

  const target = new URL(config.S3_ENDPOINT)
  target.pathname = config.BUCKET_NAME

  /**
   * Minimal proxy implementation for media assets.
   * Requests to editor.{domain}/media/… are proxied to the bucket for the current environment.
   * We do this so the urls of the files don't need to change if we change our bucket.
   * It could also allow us to setup additional restictions in the future.
   */
  const proxy = createProxyMiddleware({
    target: target.href,
    changeOrigin: true,
    pathFilter: (path) => path.startsWith('/media'),
    pathRewrite: { '^/media': '' },
    on: {
      proxyRes: (proxyRes) => {
        proxyRes.headers['Cross-Origin-Resource-Policy'] = 'cross-origin'
        proxyRes.headers['Access-Control-Allow-Origin'] = '*'
      },
    },
  })

  const s3Client = new S3Client({
    region: config.BUCKET_REGION,
    credentials: {
      accessKeyId: config.BUCKET_ACCESS_KEY_ID,
      secretAccessKey: config.BUCKET_SECRET_ACCESS_KEY,
    },
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: true,
  })

  const mimeTypeDecoder = t.union([
    t.literal('image/gif'),
    t.literal('image/jpeg'),
    t.literal('image/png'),
    t.literal('image/svg+xml'),
    t.literal('image/webp'),
    t.literal('video/webm'),
    t.literal('video/mp4'),
  ])

  const presignedUrl = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (config.ENVIRONMENT === 'edusharing')
        throw createAndLogError(
          'Handler for presigned media URL called but this is not available in edu-sharing environment'
        )
      if (!mimeTypeDecoder.is(req.query.mimeType))
        throw createAndLogError('Missing or invalid mimeType')
      const mimeType = req.query.mimeType
      if (
        !t.string.is(req.query.editorVariant) ||
        req.query.editorVariant.length > 50 ||
        /^[a-z0-9-]+$/.test(req.query.editorVariant) === false
      )
        throw createAndLogError('Missing or invalid editorVariant')
      const editorVariant = req.query.editorVariant
      const requestHost = req.headers.host
      if (!t.string.is(requestHost) || !requestHost.length)
        throw createAndLogError('Missing header: host')
      const parentHost = req.query.parentHost
      if (!t.string.is(parentHost) || !parentHost.length)
        throw createAndLogError('Missing or invalid parentHost')
      const userId = req.query.userId
      if (
        userId &&
        (!t.string.is(userId) ||
          userId.length > 100 ||
          /^[a-z0-9-]+$/i.test(userId) === false)
      )
        throw createAndLogError('Invalid userId')
      const fileHash = createId() // cuid since they are shorter and look less frightening 🙀
      const variantFolder = editorVariant === 'unknown' ? 'all' : editorVariant
      const [mediaType, mediaSubtype] = mimeType.split('/')
      const fileExtension = mimeType === 'image/svg+xml' ? 'svg' : mediaSubtype
      // Keys with slashes are expected in S3 (rendered as folders in bucket webview for example)
      const fileName = `${variantFolder}/${fileHash}/${mediaType}.${fileExtension}`
      const params: PutObjectCommandInput = {
        Key: fileName,
        Bucket: config.BUCKET_NAME,
        ContentType: mimeType,
        Metadata: {
          'Content-Type': mimeType,
          editorVariant,
          parentHost,
          requestHost,
          ...(userId ? { userId } : {}),
        },
      }
      const command = new PutObjectCommand(params)
      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      })
      if (!signedUrl) throw createAndLogError('Could not generate signed URL')
      const publicUrl = new URL(config.MEDIA_BASE_URL)
      publicUrl.pathname = '/media/' + fileName
      res.json({ signedUrl, fileUrl: publicUrl.href })
    } catch (error) {
      // Forward error to express to handle error without crashing
      // See: https://expressjs.com/en/guide/error-handling.html
      next(error)
    }
  }

  return {
    proxy,
    presignedUrl,
  }
}
