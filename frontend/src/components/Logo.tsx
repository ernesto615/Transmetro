// Logo oficial del Transmetro, Ciudad de Guatemala (archivo en public/logo-transmetro.png).
export default function Logo({ alto = 36, className = '' }: { alto?: number; className?: string }) {
  return <img src="/logo-transmetro.png" alt="Transmetro, Ciudad de Guatemala" style={{ height: alto }} className={`w-auto ${className}`} />;
}
