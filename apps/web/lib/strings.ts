// UI copy: simple Hinglish first, English sub-label (CLAUDE.md §19).
// One place so Phase 8 can swap in per-language strings.
export const t = {
  appName: "Hisaab AI",
  nav: {
    home: ["Ghar", "Home"],
    khata: ["Khata", "Customers"],
    collect: ["Wasooli", "Collect"],
  },
  home: {
    greeting: (name: string) => `Namaste, ${name.split(" ")[0]} ji`,
    scanKhata: ["Khata scan karein", "Scan khata"],
    comingSoon: ["Jald aa raha hai", "Coming soon"],
    micHint: ["Bolkar entry karein", "Hold to speak"],
    todaySales: ["Aaj ki bikri", "Today's sales"],
    udhaarDue: ["Baaki udhaar", "Udhaar due"],
    collected: ["Aaj wapas aaya", "Collected today"],
  },
  voice: {
    holdToSpeak: ["Daba kar boliye", "Hold to speak"],
    listening: ["Sun raha hoon…", "Listening…"],
    slideToCancel: ["Cancel ke liye baayein khiskaayein", "Slide left to cancel"],
    releaseToCancel: ["Chhodiye, cancel ho jayega", "Release to cancel"],
    thinking: ["Samajh raha hoon…", "Working on it…"],
    tooShort: ["Mic daba kar rakhiye aur boliye", "Hold the mic while you speak"],
    noMic: ["Mic nahi mila. Likh kar bataiye.", "No microphone access. Type instead."],
    typeInstead: ["Likh kar bataiye", "Type instead"],
    send: ["Bhejein", "Send"],
    playAgain: ["Phir se sunein", "Play again"],
    close: ["Band karein", "Close"],
    youSaid: ["Aapne kaha", "You said"],
  },
  onboarding: {
    stepOf: (n: number, total: number) => `Kadam ${n}/${total}`,
    language: ["Apni bhasha chunein", "Choose your language"],
    shop: ["Dukaan ki jaankari", "Your shop"],
    shopName: ["Dukaan ka naam", "Shop name"],
    ownerName: ["Aapka naam", "Your name"],
    city: ["Shehar (zaroori nahi)", "City (optional)"],
    consentTitle: ["Aapka data, aapki marzi", "Your data, your choice"],
    consentPoints: [
      ["Hum aapka khata, bikri aur udhaar ka hisaab rakhte hain.", "We store your ledger, sales and udhaar."],
      [
        "Aapki anumati ke bina kisi lender ya company ko kuch nahi bhejte.",
        "We never share it with a lender or company without your permission.",
      ],
      [
        "Aap kabhi bhi apna data download ya delete kar sakte hain.",
        "You can export or delete your data any time.",
      ],
    ],
    accept: ["Theek hai, shuru karein", "I agree, start"],
    next: ["Aage", "Next"],
    back: ["Peeche", "Back"],
  },
} as const;
