// Dev-only design preview: `PREVIEW_MODE=1 next dev` renders the real signed-in pages
// with fixture data, so screens can be reviewed without a Neon login or the API.
// Never active in a production build.
export const PREVIEW = process.env.NODE_ENV !== "production" && process.env.PREVIEW_MODE === "1";

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

const customers = [
  {
    id: "c1",
    name: "Khan sahab",
    balancePaise: 120000,
    earliestDue: iso(19),
    status: "overdue",
    payPrediction: "risky",
  },
  {
    id: "c2",
    name: "Sharma ji",
    balancePaise: 75000,
    earliestDue: iso(-6),
    status: "due",
    payPrediction: "will_pay",
  },
  {
    id: "c3",
    name: "Verma ji",
    balancePaise: 60000,
    earliestDue: iso(-9),
    status: "due",
    payPrediction: "will_pay",
  },
  {
    id: "c4",
    name: "Gupta ji",
    balancePaise: 45000,
    earliestDue: iso(5),
    status: "overdue",
    payPrediction: "might_delay",
  },
  {
    id: "c5",
    name: "Meena didi",
    balancePaise: 8000,
    earliestDue: iso(-12),
    status: "due",
    payPrediction: null,
  },
  {
    id: "c6",
    name: "Joshi bhaiya",
    balancePaise: 0,
    earliestDue: null,
    status: "clear",
    payPrediction: "will_pay",
  },
] as const;

export function previewFixture(path: string): unknown {
  if (path === "/me") {
    return {
      user: { authUserId: "preview", email: "ramesh@example.com" },
      membership: { userId: "u1", role: "owner" },
      merchant: {
        id: "00000000-0000-4000-8000-000000000001",
        shopName: "Sharma General Store",
        ownerName: "Ramesh Sharma",
        phone: null,
        language: "hi-IN",
        city: "Noida",
        paytmLinked: true,
        defaultDueDays: 15,
        autoGentleReminders: true,
        quietHours: { start: "21:00", end: "09:00" },
        createdAt: new Date().toISOString(),
      },
    };
  }
  if (path === "/summary/today") {
    return {
      date: iso(0),
      salesPaise: 214000,
      collectedPaise: 45000,
      udhaarDuePaise: 308000,
      overdueCustomers: 2,
    };
  }
  if (path === "/customers") return { customers };
  // Paytm profile: real numbers from the seeded demo (Gupta ji pays 3 shops, owes a 4th).
  if (path.endsWith("/network-profile")) {
    return path.includes("/c1/")
      ? { status: "no_consent", phoneMasked: "+91 •••••• 0004" }
      : {
          status: "ready",
          phoneMasked: "+91 •••••• 0001",
          score: 723,
          band: "good",
          pattern: "selective",
          baseScore: 804,
          penaltyTotal: 81,
          factors: [
            { key: "repayment", label: "Samay par wapasi (on-time repayment)", value: 0.95, weight: 0.4 },
            {
              key: "current",
              label: "Abhi koi purana baaki nahi (nothing long overdue)",
              value: 0.75,
              weight: 0.2,
            },
            { key: "promises", label: "Vaade nibhaana (promises kept)", value: 0.75, weight: 0.15 },
            {
              key: "breadth",
              label: "Kai dukaanon ka bharosa (good at many shops)",
              value: 0.67,
              weight: 0.15,
            },
            { key: "tenure", label: "Hisaab ki umar (history)", value: 0.98, weight: 0.1 },
          ],
          outstandingPaise: 153000,
          shops: [
            {
              label: "Aapki dukaan",
              isThisShop: true,
              standing: "late",
              onTimeRate: 0.95,
              outstandingPaise: 33000,
              overdueDays: 5,
              historyDays: 176,
              penalty: 0,
            },
            {
              label: "Dukaan 2 · Noida",
              isThisShop: false,
              standing: "good",
              onTimeRate: 1,
              outstandingPaise: 0,
              overdueDays: 0,
              historyDays: 173,
              penalty: 0,
            },
            {
              label: "Dukaan 3 · Noida",
              isThisShop: false,
              standing: "good",
              onTimeRate: 1,
              outstandingPaise: 0,
              overdueDays: 0,
              historyDays: 111,
              penalty: 0,
            },
            {
              label: "Dukaan 4 · Noida",
              isThisShop: false,
              standing: "overdue",
              onTimeRate: 0.86,
              outstandingPaise: 120000,
              overdueDays: 75,
              historyDays: 160,
              penalty: 81,
            },
          ],
          summary:
            "Gupta ji ka Paytm score 723 hai, total 4 dukaanon mein se 3 par record theek hai. Aapki dukaan mein ₹330 ka thoda late payment hai (5 din) aur Dukaan 4 · Noida mein ₹1,200 ka 75 din overdue hai. Agar ye overdue settle ho jaye to score 804 tak badh jayega.",
          advice:
            "Aap thoda chhota udhaar de sakte hain, lekin dhyan rakhein ki pehle overdue balance clear ho jaye.",
        };
  }
  if (path.startsWith("/customers/")) {
    const customer = customers.find((c) => path.endsWith(c.id)) ?? customers[3];
    return {
      customer: { ...customer, aliases: [] },
      entries: [
        {
          id: "e1",
          type: "credit",
          amountPaise: 12000,
          items: "2 kg chawal",
          source: "voice",
          entryDate: iso(0),
          dueDate: iso(-15),
          createdAt: new Date().toISOString(),
        },
        {
          id: "e2",
          type: "credit",
          amountPaise: 15000,
          items: "arhar dal 1 kg",
          source: "photo",
          entryDate: iso(12),
          dueDate: iso(-3),
          createdAt: new Date().toISOString(),
        },
        {
          id: "e3",
          type: "payment",
          amountPaise: 20000,
          items: null,
          source: "upi",
          entryDate: iso(30),
          dueDate: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: "e4",
          type: "credit",
          amountPaise: 18000,
          items: "aata 5 kg",
          source: "photo",
          entryDate: iso(40),
          dueDate: iso(25),
          createdAt: new Date().toISOString(),
        },
      ],
      promises: [{ id: "p1", amountPaise: 45000, promisedDate: iso(-6), status: "open" }],
    };
  }
  if (path === "/collect/dashboard") {
    return {
      dues: customers
        .filter((c) => c.balancePaise > 0)
        .map((c, i) => ({
          ...c,
          openPromiseDate: i === 3 ? iso(-6) : null,
          brokenPromises: i === 0 ? 1 : 0,
          remindedToday: i === 1,
        })),
      totals: { duePaise: 308000, overdueCount: 2, brokenPromises: 1 },
      recentCalls: [
        {
          id: "k1",
          customerName: "Gupta ji",
          outcome: "promise",
          status: "ended",
          startedAt: new Date().toISOString(),
        },
      ],
    };
  }
  if (path === "/credit/score") {
    return {
      score: 728,
      change: 18,
      factors: [
        { key: "recovery_rate", value: 0.9, weight: 0.25, points: 0.9, direction: "up" },
        { key: "sales_consistency", value: 0.62, weight: 0.2, points: 0.62, direction: "up" },
        { key: "promise_reliability", value: 0.54, weight: 0.15, points: 0.54, direction: "down" },
        { key: "digital_share", value: 0.6, weight: 0.15, points: 0.6, direction: "up" },
        { key: "avg_days_to_recover", value: 11.8, weight: 0.1, points: 0.8, direction: "up" },
        { key: "tenure_months", value: 6.1, weight: 0.1, points: 0.5, direction: "down" },
        { key: "debtor_concentration", value: 0.57, weight: 0.05, points: 0.1, direction: "down" },
      ],
      tips: [
        "Vaade nibhaiye: promise reliability 54% hai.",
        "Kuch bade customers par depend na rahein.",
        "Hisaab 12 mahine tak rakhein, score badhega.",
      ],
      computedAt: new Date().toISOString(),
    };
  }
  if (path === "/udhaar-service") {
    return {
      eligible: [
        {
          customerId: "c4",
          name: "Gupta ji",
          limitPaise: 45000,
          onTimeRate: 1,
          historyDays: 150,
          avgTicketPaise: 30000,
        },
        {
          customerId: "c3",
          name: "Verma ji",
          limitPaise: 90000,
          onTimeRate: 0.92,
          historyDays: 180,
          avgTicketPaise: 60000,
        },
      ],
      notEligible: [
        {
          customerId: "c1",
          name: "Khan sahab",
          reasons: ["Samay par wapasi 40% hai, 80% chahiye (On-time repayment below 80%)"],
        },
        {
          customerId: "c5",
          name: "Meena didi",
          reasons: ["3 mahine se kam ka hisaab (Under 3 months of history)"],
        },
      ],
      txns: [
        {
          id: "t1",
          customerId: "c2",
          customerName: "Sharma ji",
          amountPaise: 40000,
          feePaise: 600,
          status: "funded",
          repayUrl: "http://localhost:3000/pay/x",
          createdAt: new Date().toISOString(),
        },
        {
          id: "t2",
          customerId: "c3",
          customerName: "Verma ji",
          amountPaise: 25000,
          feePaise: 375,
          status: "closed",
          repayUrl: null,
          createdAt: new Date().toISOString(),
        },
      ],
      feePct: 1.5,
    };
  }
  return null;
}
