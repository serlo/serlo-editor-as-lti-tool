import * as t from 'io-ts'

const RowsPlugin = t.type({
  plugin: t.literal('rows'),
  state: t.array(t.unknown),
})
type RowsPlugin = t.TypeOf<typeof RowsPlugin>

const TextPlugin = t.type({
  plugin: t.literal('text'),
  state: t.array(t.unknown),
})

export function mergeTextPluginsRecur(content: unknown): unknown {
  if (t.array(t.unknown).is(content)) {
    return content.map(mergeTextPluginsRecur)
  }
  if (typeof content === 'object' && content !== null) {
    if (RowsPlugin.is(content)) {
      const newRows = mergeTextPlugins(content)

      return { plugin: 'rows', state: newRows.map(mergeTextPluginsRecur) }
    } else {
      return Object.fromEntries(
        Object.entries(content).map(([key, value]) => [
          key,
          mergeTextPluginsRecur(value),
        ])
      )
    }
  }

  return content
}

function mergeTextPlugins(content: RowsPlugin) {
  if (!RowsPlugin.is(content)) return content

  const newRows: unknown[] = []

  for (const row of content.state) {
    const lastRow = newRows.at(-1)

    if (TextPlugin.is(row) && TextPlugin.is(lastRow)) {
      newRows[newRows.length - 1] = {
        plugin: 'text',
        state: [
          ...lastRow.state,
          { type: 'p', children: [{ text: '' }] },
          ...row.state,
        ],
      }
    } else {
      newRows.push(row)
    }
  }

  return newRows
}
