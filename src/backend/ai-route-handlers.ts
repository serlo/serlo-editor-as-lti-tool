import { Request, Response } from 'express'
import * as t from 'io-ts'

import config from '../utils/config'
import OpenAI, { APIError } from 'openai'
import { logger } from '../utils/logger'
import * as jsonSchema from './ai/content-type.json'
import { mergeTextPluginsRecur } from './ai/merge-text-plugins-recur'
import {
  generateBeforeAfterPrompt,
  generateSystemPrompt,
} from './ai/generate-prompts'
import { changePrompt, changeSystemPrompt } from './ai/change-prompts'

const GenerateBody = t.type({
  prompt: t.string,
  before: t.string,
  after: t.string,
})

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateContent(req: Request, res: Response) {
  if (config.ENVIRONMENT === 'production') {
    return res.status(400).send('You cannot use this route in this environment')
  }
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  if (!GenerateBody.is(req.body)) {
    return res.status(400).send('Input vars are invalid')
  }

  if (req.body.prompt.trim() === '') {
    return res.status(400).send('Missing prompt')
  }

  try {
    const openAIResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: generateSystemPrompt },
        {
          role: 'system',
          content: generateBeforeAfterPrompt
            .replace('{{before}}', req.body.before)
            .replace('{{after}}', req.body.after),
        },
        {
          role: 'user',
          content: `Fulfill the following prompt of the user: ${req.body.prompt}`,
        },
      ],
      temperature: 0.25,
      response_format: {
        type: 'json_schema',
        json_schema: {
          schema: jsonSchema,
          name: 'serlo-editor-content-format',
        },
      },
    })

    const result = openAIResponse.choices[0]?.message?.content
    if (!result) {
      return res.status(500).send('No content received from LLM!')
    }

    res.status(200).json(mergeTextPluginsRecur(JSON.parse(result)))
  } catch (error) {
    handleError(error, res)
  }
}

const ChangeBody = t.type({
  prompt: t.string,
  content: t.string,
})

export async function changeContent(req: Request, res: Response) {
  if (config.ENVIRONMENT === 'production') {
    return res.status(400).send('You cannot use this route in this environment')
  }
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  if (!ChangeBody.is(req.body)) {
    return res.status(400).send('Input vars are invalid')
  }

  if (req.body.prompt.trim() === '') {
    return res.status(400).send('Missing prompt')
  }

  try {
    const openAIResponse = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: [
        { role: 'system', content: changeSystemPrompt },
        {
          role: 'system',
          content: changePrompt.replace('{{content}}', req.body.content),
        },
        {
          role: 'user',
          content: `Use the following prompt for the change: ${req.body.prompt}`,
        },
      ],
      temperature: 0.25,
      response_format: {
        type: 'json_schema',
        json_schema: {
          schema: jsonSchema,
          name: 'serlo-editor-content-format',
        },
      },
    })

    // TODO: Check content of openAIResponse for errors
    res.status(200).send(openAIResponse.choices[0]?.message?.content)
  } catch (error) {
    handleError(error, res)
  }
}

function handleError(error: unknown, res: Response) {
  if (error instanceof APIError) {
    const detailedMessage = [
      'OpenAI API error while executing prompt.',
      `Status: ${error.status}`,
      `Type: ${error.type}`,
      `Code: ${error.code}`,
      `Param: ${error.param}`,
      `Message: ${error.message}`,
    ].join('\n')

    logger.error(detailedMessage)
  } else if (error instanceof Error) {
    logger.error(`Error while executing prompt: ${error.message}`)
  } else {
    logger.error('Unknown error occurred while executing prompt')
  }
  return res.status(500).send('Error occurred while executing prompt')
}
