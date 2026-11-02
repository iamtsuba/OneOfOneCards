import { useEffect } from 'react'
import { collectionImageUrls, warmImages } from './imageCache'

// Une fois le catalogue connu, charge discrètement (quand le navigateur est au repos) les images de la collection active :
// les cartes tirées s'affichent alors tout de suite, et les visites suivantes les retrouvent dans le cache du navigateur.
export function useWarmImages(catalog, categoryId, options = {}) {
  useEffect(() => {
    const urls = collectionImageUrls(catalog, categoryId)
    if (!urls.length) return undefined
    const run = () => warmImages(urls, options)
    const idle = typeof window !== 'undefined' ? window.requestIdleCallback : undefined
    if (idle) {
      const id = idle.call(window, run, { timeout: 3000 })
      return () => window.cancelIdleCallback?.(id)
    }
    const id = setTimeout(run, 800)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, categoryId])
}
