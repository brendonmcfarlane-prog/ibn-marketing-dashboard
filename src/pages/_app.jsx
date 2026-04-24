import "@/styles/globals.css";
import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>IBN Marketing Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="iBuildNew paid media, leads, referrals and revenue by builder contract."
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
