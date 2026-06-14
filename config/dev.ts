import type { UserConfigExport } from "@tarojs/cli"

export default {
  
  mini: {
    debugReact: true,
  },
  h5: {
    devServer: {
      port: 5001,
    },
  },
} satisfies UserConfigExport<'vite'>
