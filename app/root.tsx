import { useState } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";
import { PowerOn } from "./components/Boot";
import { Rail, type Hub } from "./components/Rail";

export const links: Route.LinksFunction = () => [
  { rel: "preload", href: "/fonts/JetBrainsMono-Regular.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
  { rel: "stylesheet", href: stylesheet },
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/icons/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png", sizes: "180x180" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#2E3440" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Agora" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="bg" aria-hidden="true" />
        {children}
        <div className="crt" aria-hidden="true">
          <i className="roll" />
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// The shell (rail, power-on) stays mounted across client-side navigations, so only the first load plays the power-on.
export default function App() {
  const [hub, setHub] = useState<Hub>({ link: "connecting" });
  return (
    <>
      <Rail hub={hub} />
      <PowerOn />
      <Outlet context={setHub} />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Unexpected error";
  return (
    <main>
      <h1>{message}</h1>
    </main>
  );
}
