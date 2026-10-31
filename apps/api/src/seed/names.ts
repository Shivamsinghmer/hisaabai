import type { Rng } from "./random.js";

export const CITIES = ["Noida", "Delhi", "Kanpur", "Lucknow", "Jaipur"] as const;

const SURNAMES = [
  "Gupta",
  "Verma",
  "Sharma",
  "Agarwal",
  "Singh",
  "Yadav",
  "Mishra",
  "Tiwari",
  "Pandey",
  "Chauhan",
  "Rawat",
  "Joshi",
  "Saxena",
  "Srivastava",
  "Jain",
  "Bansal",
  "Goel",
  "Mittal",
  "Malhotra",
  "Kapoor",
  "Arora",
  "Bhatia",
  "Sethi",
  "Rathore",
  "Saini",
  "Kushwaha",
  "Prajapati",
  "Maurya",
  "Khan",
  "Ansari",
  "Qureshi",
  "Siddiqui",
  "Shaikh",
  "Mirza",
  "Dubey",
  "Shukla",
  "Tripathi",
  "Rastogi",
  "Khanna",
  "Bhardwaj",
];
const MUSLIM_SURNAMES = new Set(["Khan", "Ansari", "Qureshi", "Siddiqui", "Shaikh", "Mirza"]);

const MALE = [
  "Ramesh",
  "Suresh",
  "Mahesh",
  "Rajesh",
  "Dinesh",
  "Anil",
  "Sunil",
  "Vijay",
  "Sanjay",
  "Manoj",
  "Pankaj",
  "Rakesh",
  "Mukesh",
  "Arun",
  "Deepak",
  "Ravi",
  "Amit",
  "Rohit",
  "Naveen",
  "Ashok",
];
const MALE_MUSLIM = ["Imran", "Salman", "Arif", "Irfan", "Javed", "Shahid", "Faisal", "Nadeem"];
const FEMALE = [
  "Meena",
  "Sunita",
  "Anita",
  "Kavita",
  "Pooja",
  "Neha",
  "Rekha",
  "Seema",
  "Geeta",
  "Priya",
  "Rani",
  "Kamla",
  "Savita",
  "Usha",
  "Asha",
  "Lata",
];
const FEMALE_MUSLIM = ["Shabana", "Nazia", "Rukhsar", "Farzana", "Shabnam"];

export type PersonName = { display: string; aliases: string[] };

/**
 * A customer name as a shopkeeper would write it in the khata, plus aliases the
 * voice/photo matcher should accept ("Gupta ji" / "Gupta jee" / "Suresh Gupta").
 */
export function customerName(rng: Rng): PersonName {
  const surname = rng.pick(SURNAMES);
  const muslim = MUSLIM_SURNAMES.has(surname);
  const female = rng.chance(0.35);
  const first = female ? rng.pick(muslim ? FEMALE_MUSLIM : FEMALE) : rng.pick(muslim ? MALE_MUSLIM : MALE);
  const full = `${first} ${surname}`;

  const style = rng.next();
  if (female) {
    if (style < 0.5) return { display: `${first} didi`, aliases: [`${first} di`, full] };
    if (style < 0.8) return { display: `${first} aunty`, aliases: [`${first} anti`, full] };
    return { display: `${surname} bhabhi`, aliases: [`${first} bhabhi`, full] };
  }
  if (muslim && style < 0.6) return { display: `${surname} sahab`, aliases: [`${surname} saab`, full] };
  if (style < 0.6) return { display: `${surname} ji`, aliases: [`${surname} jee`, full] };
  if (style < 0.85) return { display: `${first} bhaiya`, aliases: [`${first} bhai`, full] };
  return { display: `${first} ji`, aliases: [`${first} jee`, full] };
}

export function ownerName(rng: Rng): { owner: string; surname: string } {
  const surname = rng.pick(SURNAMES);
  const muslim = MUSLIM_SURNAMES.has(surname);
  return { owner: `${rng.pick(muslim ? MALE_MUSLIM : MALE)} ${surname}`, surname };
}

export function shopName(rng: Rng, surname: string, ownerFirst: string): string {
  return rng.pick([
    `${surname} General Store`,
    `${surname} Kirana Store`,
    `${ownerFirst} Provision Store`,
    `New ${surname} Traders`,
    `Shri Ram Kirana`,
    `Maa Durga General Store`,
    `${surname} Brothers Kirana`,
    `Jai Mata Di Stores`,
    `${ownerFirst} Kirana & General Store`,
  ]);
}
