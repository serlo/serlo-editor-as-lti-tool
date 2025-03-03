import { randomBytes } from 'crypto'
import { readFile, writeFile } from 'fs/promises'

generateSecretKey()

async function generateSecretKey() {
  // Secret key used for HS256
  // Needs to be min. 256 bits
  // Generates 256 random bits and encodes them as text using base64
  const base64EncodedSecretKey = randomBytes(32).toString('base64')

  const envContent = await readFile('.env', { encoding: 'utf-8' })

  const regex = /LTIJS_KEY=.*\s/g

  const newEnvContent = envContent.replaceAll(
    regex,
    `LTIJS_KEY=${base64EncodedSecretKey}\n`
  )

  if (envContent === newEnvContent)
    throw new Error(
      'Did not find location in .env file to place the new secret key. Nothing was changed.'
    )

  await writeFile('.env', newEnvContent)

  // eslint-disable-next-line no-console
  console.log(
    'Added new secret key to .env file. Restart the service to use the new secret key.'
  )
  // eslint-disable-next-line no-console
  console.log(
    '⚠ If you encounter issues after restarting the server, try deleting session data in the MongoDB database, which is still signed using the old secret key.'
  )
}
