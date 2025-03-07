import EditorLogoLight from './assets/serlo-editor-logo-light.svg'

export default function Header() {
  const queryString = window.location.search
  const urlParams = new URLSearchParams(queryString)
  const title = urlParams.get('title') ?? 'Inhalt'

  return (
    <div className="flex items-center p-4 shadow-md mb-2 gap-4">
      <img className="w-14 h-14" src={EditorLogoLight} />
      <div>
        <div>
          <a
            onClick={() => history.go(-1)}
            className="text-sky-600 text-sm cursor-pointer"
          >
            <span className="rotate-180 inline-block">⮕</span> Zurück
          </a>{' '}
          {/* {contextTitle ? (
            <span className="text-sm text-gray-500">
              ({contextTitle})
            </span>
          ) : null} */}
        </div>
        <h2 className="text-xl">{title}</h2>
      </div>
    </div>
  )
}

export interface HeaderContent {
  title: string
}
