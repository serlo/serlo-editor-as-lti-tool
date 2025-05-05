import Header from './Header'
import { isInIframe } from './utils/is-in-iframe'

// Centered & max-width content layout
export function Layout({ children }: { children: React.ReactNode }) {
  const showHeader = !isInIframe

  return (
    <div className="grid grid-rows-[auto_auto] grid-cols-[1fr_minmax(40rem,64rem)_1fr] bg-white">
      <header className="col-start-1 col-end-4 overflow-x-hidden">
        {showHeader ? <Header /> : null}
      </header>
      <main className="p-12 col-start-2 col-end-3 overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
