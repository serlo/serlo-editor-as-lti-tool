export const edusharingAsToolConfigs: {
  issWhenEdusharingLaunchedSerloEditor: string
  loginEndpoint: string
  launchEndpoint: string
  clientId: string
  detailsEndpoint: string
  keysetEndpoint: string
}[] = []

/** Gets the endpoints and clientId for an edu-sharing instance used as an LTI tool during embed of edu-sharing content.
 *
 * Function accepts `issWhenEdusharingLaunchedSerloEditor` or `edusharingClientIdOnSerloEditor` because during the LTI flow we have either one or the other available to us.
 */
export function getEdusharingAsToolConfiguration(
  entryToFind:
    | { issWhenEdusharingLaunchedSerloEditor: string }
    | { edusharingClientIdOnSerloEditor: string }
) {
  const edusharingAsToolConfig = edusharingAsToolConfigs.find((config) => {
    if ('issWhenEdusharingLaunchedSerloEditor' in entryToFind)
      return (
        config.issWhenEdusharingLaunchedSerloEditor ===
        entryToFind.issWhenEdusharingLaunchedSerloEditor
      )
    else {
      return config.clientId === entryToFind.edusharingClientIdOnSerloEditor
    }
  })
  return edusharingAsToolConfig
}
