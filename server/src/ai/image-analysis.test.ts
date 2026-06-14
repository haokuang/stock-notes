import assert from 'node:assert/strict'
import test from 'node:test'
import { getStorageConfig } from '../upload/storage-config'
import { getVisionConfig, parseImageAnalysis } from './image-analysis'

test('returns null when storage credentials are incomplete', () => {
  assert.equal(getStorageConfig({ COZE_BUCKET_NAME: 'notes' }), null)
})

test('maps TOS-compatible storage environment variables', () => {
  assert.deepEqual(
    getStorageConfig({
      COZE_BUCKET_ENDPOINT_URL: 'https://tos.example.cn',
      COZE_BUCKET_NAME: 'notes',
      AWS_ACCESS_KEY_ID: 'key',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_REGION: 'cn-beijing',
    }),
    {
      endpointUrl: 'https://tos.example.cn',
      bucketName: 'notes',
      accessKey: 'key',
      secretKey: 'secret',
      region: 'cn-beijing',
    },
  )
})

test('requires an explicit vision model configuration', () => {
  assert.equal(getVisionConfig({ VISION_API_KEY: 'key' }), null)
  assert.deepEqual(
    getVisionConfig({
      VISION_API_KEY: 'key',
      VISION_BASE_URL: 'https://vision.example.cn/v1',
      VISION_MODEL: 'vision-model',
    }),
    {
      apiKey: 'key',
      baseURL: 'https://vision.example.cn/v1',
      model: 'vision-model',
    },
  )
})

test('normalizes fenced JSON returned by a vision model', () => {
  assert.deepEqual(
    parseImageAnalysis(
      '```json\n{"description":"日线图","keyPoints":["放量"],"sentiment":"bull","confidence":1.2}\n```',
      'https://tos.example.cn/chart.png',
    ),
    {
      summary: '日线图',
      key_points: ['放量'],
      sentiment: 'bull',
      confidence: 1,
      image_url: 'https://tos.example.cn/chart.png',
      mock: false,
    },
  )
})
