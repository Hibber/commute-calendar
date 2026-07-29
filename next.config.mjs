import withPWAInit from "@ducanh2912/next-pwa";

// `/` returns a different document depending on whether you are signed in, and
// the sign-in return trip from Clerk is a redirect. Neither survives being run
// through a service worker cache:
//
//  - The default `start-url` route rewrites an `opaqueredirect` response into a
//    synthesized 200, which breaks the redirect that completes Clerk's
//    handshake -- so the browser lands back on the signed-out document.
//  - The `pages*` routes persist rendered HTML in the Cache API, which for this
//    app means storing an authenticated dashboard on disk and being able to
//    replay it later.
//
// Documents therefore always come from the network. Static assets keep their
// caching, so the app still installs and loads as a PWA.
const documentIsSameOriginPage = ({ url: { pathname }, sameOrigin }) =>
  sameOrigin && !pathname.startsWith("/api/");

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // Both are needed. `cacheStartUrl` keeps `/` out of the precache manifest;
  // `dynamicStartUrl` is what actually injects the `start-url` route carrying
  // the opaqueredirect rewrite, despite its own docs implying it only applies
  // when `cacheStartUrl` is true.
  cacheStartUrl: false,
  dynamicStartUrl: false,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    // Matched by `cacheName` against next-pwa's defaults, which replaces them.
    runtimeCaching: [
      {
        urlPattern: ({ request, url: { pathname }, sameOrigin }) =>
          request.headers.get("RSC") === "1" &&
          request.headers.get("Next-Router-Prefetch") === "1" &&
          sameOrigin &&
          !pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        options: { cacheName: "pages-rsc-prefetch" },
      },
      {
        urlPattern: ({ request, url: { pathname }, sameOrigin }) =>
          request.headers.get("RSC") === "1" &&
          sameOrigin &&
          !pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        options: { cacheName: "pages-rsc" },
      },
      {
        urlPattern: documentIsSameOriginPage,
        handler: "NetworkOnly",
        options: { cacheName: "pages" },
      },
    ],
  },
});

const nextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
