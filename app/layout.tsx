import "../src/styles.css";

export const metadata = {
  title: "PROJECT 202 | Hamad's CFA Level I Mastery System",
  description: "Project 202 — Hamad's CFA Level I Mastery System",
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
        <meta name="theme-color" content="#10272b" />
        <meta name="application-name" content="Project 202" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Project 202" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
