import type { AppStateError } from './hooks/use-app-state'

interface ErrorProps {
  appState: AppStateError
}

export default function Error({ appState }: ErrorProps) {
  return (
    <div className="bg-white p-4">
      <div className="border-4 border-red-700 rounded-lg p-4">
        {appState.message}
      </div>
      {appState.imageURL ? (
        <img className="mt-8 max-w-96" src={appState.imageURL} />
      ) : null}
    </div>
  )
}
