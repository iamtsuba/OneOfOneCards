import { IS_PREPROD } from '../env'

// Bandeau visible uniquement en préproduction : évite de confondre l'environnement de test avec la production
export default function EnvBanner() {
  if (!IS_PREPROD) return null
  return (
    <div className="env-banner" role="status">
      <strong>Préproduction</strong> : environnement de test, les données ne sont pas celles du vrai jeu.
    </div>
  )
}
