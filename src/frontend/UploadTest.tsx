import { useState, useRef } from 'react'

export function UploadTest() {
  const [status, setStatus] = useState<'no-uploads' | '' | 'uploaded'>(
    'no-uploads'
  )
  const inputRef = useRef<HTMLInputElement>(null)

  function upload() {
    const files = inputRef.current?.files
    if (!files) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      retrieveNewURL(file, (file: File, data: EndpointResponse) => {
        uploadFile(file, data)
      })
    }
  }

  type EndpointResponse = { signedUrl: string; imgSrc: string }

  // `retrieveNewURL` accepts the name of the current file and invokes the `/presignedUrl` endpoint to
  // generate a pre-signed URL for use in uploading that file:
  function retrieveNewURL(
    file: File,
    cb: (file: File, data: EndpointResponse) => void
  ) {
    fetch(
      `/media/presigned-url?mimeType=${encodeURIComponent(file.type)}&editorVariant=${encodeURIComponent('lti-tool')}`
    )
      .then((response) => {
        void response.json().then((data) => {
          cb(file, data as EndpointResponse)
        })
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error(e)
      })
  }

  // `uploadFile` accepts the current filename and the pre-signed URL. It then uses `Fetch API`
  // to upload this file to S3 at `play.min.io:9000` using the URL:
  function uploadFile(file: File, data: EndpointResponse) {
    if (status === 'no-uploads') setStatus('')
    fetch(data.signedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
        Origin: 'http://localhost:3000',
      },
    })
      .then(() => {
        console.log(file.name)
        console.log(data.imgSrc)
        setStatus('uploaded')

        // document.querySelector('#status').innerHTML +=
        //   `<br>Uploaded ${file.name}.`
      })
      .catch((e) => {
        console.log('catched')
        // eslint-disable-next-line no-console
        console.error(e)
      })
  }

  return (
    <>
      <input type="file" ref={inputRef} multiple />
      <button onClick={upload}>Upload</button>

      <div>
        {status === 'no-uploads'
          ? 'No uploads'
          : status === 'uploaded'
            ? 'Uploaded!'
            : ''}
      </div>
    </>
  )
}
