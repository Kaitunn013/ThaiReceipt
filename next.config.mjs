import nextPwa from "next-pwa";
import defaultCache from "next-pwa/cache.js";

const withPWA = nextPwa({
  dest: "public",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      // Private pages and Supabase data must not be served from an offline cache.
      urlPattern: ({ url, sameOrigin }) =>
        (sameOrigin && /^\/(?:dashboard|auth)(?:\/|$)/.test(url.pathname)) ||
        /^\/(?:storage|rest|auth)\/v1(?:\/|$)/.test(url.pathname),
      handler: "NetworkOnly"
    },
    ...defaultCache
  ],
  disable: process.env.NODE_ENV === "development"
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true
};

export default withPWA(nextConfig);
