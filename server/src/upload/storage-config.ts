export interface StorageEnvironment {
  [key: string]: string | undefined
  COZE_BUCKET_ENDPOINT_URL?: string
  COZE_BUCKET_NAME?: string
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  AWS_REGION?: string
}

export interface StorageConfig {
  endpointUrl: string
  bucketName: string
  accessKey: string
  secretKey: string
  region: string
}

export function getStorageConfig(env: StorageEnvironment): StorageConfig | null {
  const endpointUrl = env.COZE_BUCKET_ENDPOINT_URL?.trim()
  const bucketName = env.COZE_BUCKET_NAME?.trim()
  const accessKey = env.AWS_ACCESS_KEY_ID?.trim()
  const secretKey = env.AWS_SECRET_ACCESS_KEY?.trim()

  if (!endpointUrl || !bucketName || !accessKey || !secretKey) {
    return null
  }

  return {
    endpointUrl,
    bucketName,
    accessKey,
    secretKey,
    region: env.AWS_REGION?.trim() || 'cn-beijing',
  }
}
