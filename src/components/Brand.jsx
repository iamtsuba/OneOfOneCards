export default function Brand({ size = 'md' }) {
  return (
    <div className={`brand ${size}`}>
      <span className="brand-mark" aria-hidden="true">1/1</span>
      <span className="brand-name">1/1 Cards</span>
    </div>
  )
}
