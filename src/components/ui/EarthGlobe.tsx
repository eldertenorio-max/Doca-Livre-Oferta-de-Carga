import '../../styles/earth-globe.css'

export function EarthGlobe() {
  return (
    <div className="earth-globe" aria-hidden="true">
      <div className="earth-globe__space">
        <div className="earth-globe__sphere" />
        <div className="earth-globe__shine" />
      </div>
    </div>
  )
}
