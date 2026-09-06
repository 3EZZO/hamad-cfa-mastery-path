import "../src/styles.css";

export const metadata = {
  title: "Hamad's CFA Level I Mastery Path",
  description:
    "Hamad's private CFA Level I study, evidence, and tutoring workspace",
  authors: [{ name: "Mohamed Ali, CFA" }],
  creator: "Mohamed Ali, CFA",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/project-202-mark.svg",
    apple: "/icons/project-202-apple-touch.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#132c44" />
        <meta name="application-name" content="Hamad CFA Mastery" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Hamad Mastery" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
