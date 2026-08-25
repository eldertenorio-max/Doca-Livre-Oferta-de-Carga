declare module 'shpjs' {
  type ShpFc = GeoJSON.FeatureCollection & { fileName?: string }
  export default function shp(
    base: string | ArrayBuffer | Uint8Array | DataView,
  ): Promise<ShpFc | ShpFc[]>
}
