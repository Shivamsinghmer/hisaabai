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
