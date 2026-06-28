import assert from 'node:assert/strict'
import test from 'node:test'

import {
  H5_VITE_DEDUPED_DEPENDENCIES,
  H5_VITE_PREBUNDLED_DEPENDENCIES,
} from './index'

test('H5 Vite config keeps React as a singleton and prebundles late-loading deps', () => {
  assert.deepEqual(H5_VITE_DEDUPED_DEPENDENCIES, ['react', 'react-dom'])
  assert.ok(H5_VITE_PREBUNDLED_DEPENDENCIES.includes('@supabase/supabase-js'))
})
