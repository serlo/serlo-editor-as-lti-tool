import { execSync } from 'child_process'
import { randomBytes } from 'crypto'
import { readFile, writeFile } from 'fs/promises'
import readline from 'readline/promises'

generateSecretKey()

async function generateSecretKey() {
  // eslint-disable-next-line no-console
  console.log(
    'Warning: This will reset mongodb and invalidate all current user sessions. Continue?'
  )

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const userAnswer = await rl.question('Continue? [y/n] ')

  rl.close()

  if (userAnswer.trim() !== 'y') return

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

  const timeoutInMilliseconds = 10000

  // Drop Mongodb database
  try {
    execSync(
      `mongosh --eval 'use test' --eval 'db.dropDatabase()' ${process.env.MONGODB_URI}`,
      { timeout: timeoutInMilliseconds }
    )
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(`Failed to drop MongoDB database. Error: ${error}`)
    return
  }

  // eslint-disable-next-line no-console
  console.log('Added new secret key to .env file and dropped MongoDB database.')
  // eslint-disable-next-line no-console
  console.log(
    'Important: Restart the service now to use the new secret key and save the new .env file to the bucket.'
  )
}
