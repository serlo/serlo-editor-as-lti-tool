import { createId } from '@paralleldrive/cuid2'
import * as t from 'io-ts'
import {
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createProxyMiddleware } from 'http-proxy-middleware'
import type { Request, Response } from 'express'
import config from '../utils/config'

const endpoint = config.S3_ENDPOINT
const bucketName = config.BUCKET_NAME

const target = new URL(endpoint)
target.pathname = bucketName

/**
 * Minimal proxy implementation for media assets.
 * Requests to editor.{domain}/media/… are proxied to the bucket for the current environment.
 * We do this so the urls of the image don't need to change if we change our bucket.
 * It could also allow us to setup additional restictions in the future.
 */
export const mediaProxy = createProxyMiddleware({
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
  endpoint,
  forcePathStyle: true, // test, maybe only set on dev
})

const mimeTypeDecoder = t.union([
  t.literal('image/gif'),
  t.literal('image/jpeg'),
  t.literal('image/png'),
  t.literal('image/svg+xml'),
  t.literal('image/webp'),
])

export async function mediaPresignedUrl(req: Request, res: Response) {
  const mimeType = decodeURIComponent(String(req.query.mimeType))
  if (!mimeTypeDecoder.is(mimeType)) {
    res.status(400).send('Missing or invalid mimeType')
    return
  }

  const editorVariant = decodeURIComponent(String(req.query.editorVariant))
  if (!t.string.is(req.query.editorVariant)) {
    // if we have this code in the same monorepo as the editor we can check known editorVariant values
    res.status(400).send('Missing or invalid editorVariant')
    return
  }

  const editorHost = req.headers.host
  if (!t.string.is(editorHost) || !editorHost.length) {
    res.status(400).send('Missing header: host')
  }

  const fileHash = createId() // cuid since they are shorter and look less frightening

  const variantFolder = editorVariant === 'unknown' ? 'all' : editorVariant

  const [mediaType, mediaSubtype] = mimeType.split('/')
  const fileExtension = mimeType === 'image/svg+xml' ? 'svg' : mediaSubtype

  // Keys with slashes are expected in S3 (rendered as folders in bucket view)
  const fileName = `${variantFolder}/${fileHash}/${mediaType}.${fileExtension}`

  const params: PutObjectCommandInput = {
    Key: fileName,
    Bucket: bucketName,
    ContentType: mimeType,
    Metadata: { 'Content-Type': mimeType },
    Tagging: `editorVariant=${editorVariant}&editorHost=${req.headers.host}`,
  }

  const command = new PutObjectCommand(params)
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })

  if (!signedUrl) {
    res.status(500).send('Could not generate signed URL')
    return
  }

  const imgUrl = new URL(config.MEDIA_BASE_URL)
  imgUrl.pathname = '/media/' + fileName

  res.json({ signedUrl, imgSrc: imgUrl.href })
}
