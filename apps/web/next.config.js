/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@x-cup/types", "@x-cup/abi"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "media.api-sports.io", pathname: "/football/**" },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  },
};

module.exports = nextConfig;
