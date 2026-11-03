/**
 * Locale-owned native authentication copy; no provider account is an identity option.
 * @param language - Operating-system language tag.
 * @returns Sign-in labels, actions and failure instructions for the native window.
 */
export function indusAuthCopy(language: string) {
  const en = {
    language: 'en',
    title: 'I/O Harness — Indus Orbit',
    credits: 'Connect I/O credits…',
    brand: '[H]',
    poweredBy: 'Powered by I/O',
    expansion: 'I/O Harness',
    line: 'Intelligence, built together.',
    intro: 'Sign in with your Indus Orbit account.',
    start: 'Sign in with Indus Orbit',
    cancel: 'Cancel sign-in',
    signOut: 'Sign out of Indus Orbit',
    unconfigured:
      'Indus Orbit sign-in is not configured for this build. A registered desktop client and the Indus Orbit consent page are required. No provider account will be opened.',
    'signed-out': 'Your browser will open Indus Orbit sign-in and ask you to approve this device.',
    waiting: 'Finish signing in and approving I/O Harness in your browser.',
    'signed-in': 'Signed in to Indus Orbit.',
    loading: 'Preparing Indus Orbit sign-in…',
    unavailable: 'Sign-in could not load. Close and reopen I/O Harness. If this continues, install a fresh copy.',
    failed: 'Sign-in could not finish. Check your connection and try again.',
  }
  return /^hi(?:-|$)/i.test(language)
    ? {
      ...en,
      language: 'hi',
      poweredBy: 'I/O द्वारा संचालित',
      loading: 'Indus Orbit साइन इन तैयार हो रहा है…',
      unavailable: 'साइन इन लोड नहीं हो सका। I/O Harness बंद करके फिर खोलें। समस्या बनी रहे तो नई प्रति इंस्टॉल करें।',
      intro: 'अपने Indus Orbit खाते से साइन इन करें।',
      credits: 'I/O क्रेडिट जोड़ें…',
      start: 'Indus Orbit से साइन इन करें',
      cancel: 'साइन इन रद्द करें',
      signOut: 'Indus Orbit से साइन आउट करें',
      unconfigured:
          'इस संस्करण में Indus Orbit साइन इन सेट नहीं है। पंजीकृत डेस्कटॉप क्लाइंट और Indus Orbit अनुमति पेज आवश्यक हैं। किसी मॉडल प्रदाता का खाता नहीं खुलेगा।',
      'signed-out': 'आपके ब्राउज़र में Indus Orbit साइन इन खुलेगा और इस डिवाइस की अनुमति मांगेगा।',
      waiting: 'अपने ब्राउज़र में साइन इन करें और I/O Harness को अनुमति दें।',
      'signed-in': 'Indus Orbit में साइन इन हो गया है।',
      failed: 'साइन इन पूरा नहीं हो सका। अपना कनेक्शन जांचें और फिर प्रयास करें।',
    }
    : en
}
