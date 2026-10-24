import { Suspense, lazy } from 'react'

// /?demo opens the investor demo without loading Firebase or the couples app
const isDemo = new URLSearchParams(window.location.search).has('demo')
const Screen = isDemo ? lazy(() => import('./demo/DemoApp.jsx')) : lazy(() => import('./App.jsx'))

export default function Root() {
  return <Suspense fallback={null}><Screen /></Suspense>
}
