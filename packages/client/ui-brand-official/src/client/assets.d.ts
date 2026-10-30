/** The approved raster master is embedded in this plugin's client bundle. */
declare module '*.png' {
  const url: string
  export default url
}

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
