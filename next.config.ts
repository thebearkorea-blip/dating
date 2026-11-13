import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite는 번들하지 않고 Node에서 그대로 로드한다.
  serverExternalPackages: ["@electric-sql/pglite"],
  // src/engine·policy는 ESM 관례대로 "./x.js"로 import한다. webpack이 .ts로 풀도록 알려 준다.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
