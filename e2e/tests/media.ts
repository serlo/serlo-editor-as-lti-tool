/* eslint-disable no-console */
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import config from '../../src/utils/config'

Feature('Media upload and proxy')

const s3Client = new S3Client({
  region: config.BUCKET_REGION,
  credentials: {
    accessKeyId: config.BUCKET_ACCESS_KEY_ID,
    secretAccessKey: config.BUCKET_SECRET_ACCESS_KEY,
  },
  endpoint: config.S3_ENDPOINT,
  forcePathStyle: true,
})

const uploadedKeys: string[] = []

Scenario('Requesting media proxy with example image works', ({ I }) => {
  I.sendGetRequest('http://localhost:3000/media/four-byte-burger.png')
  I.seeResponseCodeIsSuccessful()
})

Scenario('Requesting media proxy with invalid url returns 400', ({ I }) => {
  I.sendGetRequest('http://localhost:3000/media/imaginary987.png')
  I.seeResponseCodeIs(403)
})
if (config.BUCKET_ACCESS_KEY_ID !== 'placeholder') {
  Scenario(
    'Media: Uploading image works and Metadata is written as expected',
    async ({ I }) => {
      I.amOnPage('http://localhost:3000')

      const presignedResponse = await fetch(
        'http://localhost:3000/media/presigned-url?mimeType=image/png&editorVariant=test-uploads&userId=test&parentHost=localhost:3000'
      )
      const data = await presignedResponse.json()
      I.assertStartsWith(
        data.signedUrl,
        'https://s3.eu-central-3.ionoscloud.com/editor-media-assets-development/test-uploads/'
      )
      I.assertStartsWith(data.fileUrl, 'https://editor.serlo.dev/media/')

      // // 1x1 pixel png
      const base64Data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z/C/HwAF/gL+Tf7XNQAAAABJRU5ErkJggg=='
      const binaryData = atob(base64Data)
      const byteArray = Uint8Array.from(binaryData, (char) =>
        char.charCodeAt(0)
      )
      const file = new File([byteArray], '1x1.png', { type: 'image/png' })

      console.log(data.signedUrl)

      const uploadResponse = await fetch(data.signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': file.type,
        },
      }).catch((e) => {
        console.error(e)
        I.assertFalse(true) // fail test
      })

      if (!uploadResponse || uploadResponse.status !== 200) {
        const res = uploadResponse as Response
        console.log(res.headers)
        console.log(res.status)
        const text = await res.text()
        console.log(text)
        I.assertFalse(true) // fail test
      }

      I.sendGetRequest(data.fileUrl)
      I.seeResponseCodeIsSuccessful()

      const key = data.fileUrl.replace(config.MEDIA_BASE_URL + '/media/', '')

      uploadedKeys.push(key)

      const inputValues = {
        Bucket: 'editor-media-assets-development',
        Key: key,
      }
      const headCommand = new HeadObjectCommand(inputValues)
      const metaResponse = await s3Client.send(headCommand)
      I.assertEqual(
        JSON.stringify(metaResponse.Metadata),
        '{"content-type":"image/png","editorvariant":"test-uploads","parenthost":"localhost:3000","requesthost":"localhost:3000","userid":"test"}'
      )
    }
  )
}
