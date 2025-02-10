import Header from './Header'
import { isInIframe } from './utils/is-in-iframe'
import { isLocalOrDev } from './utils/is-local-or-dev'

// Centered & max-width content layout
export function Layout({ children }: { children: React.ReactNode }) {
  const showHeader = !isInIframe && isLocalOrDev

  return (
    <>
      {showHeader ? <Header /> : null}

      <div className="flex min-w-[40rem] overflow-x-auto bg-white">
        <main className="mx-auto max-w-[60rem] px-12">
          <div className="py-12">{children}</div>
        </main>
      </div>
    </>
  )
}
