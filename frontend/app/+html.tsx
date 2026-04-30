// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* Preload Ionicons font - critical for Safari/iOS */}
        <link
          rel="preload"
          href="/fonts/Ionicons.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />

        {/* @font-face with clean path for Safari iOS compatibility */}
        <style
          id="safari-font-fix"
          dangerouslySetInnerHTML={{
            __html: `
              @font-face {
                font-family: 'Ionicons';
                src: url('/fonts/Ionicons.ttf') format('truetype');
                font-weight: normal;
                font-style: normal;
                font-display: swap;
              }
              @font-face {
                font-family: 'ionicons';
                src: url('/fonts/Ionicons.ttf') format('truetype');
                font-weight: normal;
                font-style: normal;
                font-display: swap;
              }
            `,
          }}
        />

        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
