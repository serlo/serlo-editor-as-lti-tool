import { v4 as uuid_v4 } from 'uuid'

// TODO: Export this from editor package
export function createInitialContent() {
  return {
    id: uuid_v4(),
    type: 'https://serlo.org/editor',
    variant: 'lti-tool',
    domainOrigin: 'server',
    version: 2,
    editorVersion: '0.12.0',
    dateModified: new Date().toISOString(),
    document: {
      plugin: 'type-generic-content',
      state: {
        content: {
          plugin: 'rows',
        },
      },
    },
  }
}
