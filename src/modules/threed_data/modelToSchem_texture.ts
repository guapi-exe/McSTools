const normalizeTextureKey = (value: string) => value.replace(/\\/g, '/').toLowerCase()

export class ModelTextureResolver {
  private textureObjectUrls = new Map<string, string>()
  private textureMap = new Map<string, string>()
  private lastSignature = ''

  clear() {
    for (const url of this.textureObjectUrls.values()) {
      URL.revokeObjectURL(url)
    }
    this.textureObjectUrls.clear()
    this.textureMap.clear()
    this.lastSignature = ''
  }

  update(files: File[]) {
    const signature = files
      .map(file => `${file.name}:${file.size}:${file.lastModified}`)
      .sort()
      .join('|')

    if (signature === this.lastSignature) return

    this.clear()
    this.lastSignature = signature

    for (const file of files) {
      const objectUrl = URL.createObjectURL(file)
      this.textureObjectUrls.set(file.name, objectUrl)
      const normalizedName = normalizeTextureKey(file.name)
      this.textureMap.set(normalizedName, objectUrl)
      const basename = normalizedName.split('/').pop()
      if (basename) this.textureMap.set(basename, objectUrl)
    }
  }

  resolve(url: string) {
    const safeUrl = normalizeTextureKey((url || '').split('#')[0].split('?')[0])
    if (this.textureMap.has(safeUrl)) return this.textureMap.get(safeUrl)!
    const basename = safeUrl.split('/').pop() || ''
    if (basename && this.textureMap.has(basename)) return this.textureMap.get(basename)!
    return url
  }
}
