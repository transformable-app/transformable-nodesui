export type NodesUICompanionPluginOptions = {
  endpointPath?: string
  pluginVersion?: string
  urlTemplates?: {
    admin?: string
    preview?: string
  }
  writableCollections?: string[]
}
