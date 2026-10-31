// Merchant + membership data access. Every function that reads or writes
// merchant data takes the merchantId from the authenticated membership,
// never from the request body (§16 data separation).
import type { CreateMerchantBody, Merchant, MerchantSettingsPatch, Role } from "@hisaab/shared";
import { eq } from "drizzle-orm";
import type { Db } from "../client.js";
import { consents, merchants, users } from "../schema.js";

export type Membership = { userId: string; merchantId: string; role: Role };

export async function findMembership(db: Db, authUserId: string): Promise<Membership | null> {
  const [row] = await db
    .select({ userId: users.id, merchantId: users.merchantId, role: users.role })
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  if (!row?.merchantId) return null;
  return { userId: row.userId, merchantId: row.merchantId, role: row.role };
}

type MerchantRow = typeof merchants.$inferSelect;

export function toMerchant(row: MerchantRow): Merchant {
  return {
    id: row.id,
    shopName: row.shopName,
    ownerName: row.ownerName,
    phone: row.phone,
    language: row.language,
    city: row.city,
    paytmLinked: row.paytmLinked ?? false,
    defaultDueDays: row.defaultDueDays ?? 15,
    autoGentleReminders: row.autoGentleReminders ?? true,
    quietHours: row.quietHours ?? { start: "21:00", end: "09:00" },
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  };
}

export async function getMerchant(db: Db, merchantId: string): Promise<Merchant | null> {
  const [row] = await db.select().from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  return row ? toMerchant(row) : null;
}

/** Onboarding: creates the shop, makes the signed-in user its owner, records consent. */
export async function createMerchantWithOwner(
  db: Db,
  input: CreateMerchantBody,
  owner: { authUserId: string; email: string | null },
): Promise<{ merchant: Merchant; membership: Membership }> {
  return db.transaction(async (tx) => {
    const [merchant] = await tx
      .insert(merchants)
      .values({
        shopName: input.shopName,
        ownerName: input.ownerName,
        language: input.language,
        city: input.city,
        phone: input.phone,
      })
      .returning();
    const [user] = await tx
      .insert(users)
      .values({
        merchantId: merchant!.id,
        authUserId: owner.authUserId,
        email: owner.email,
        phone: input.phone,
        role: "owner",
      })
      .returning({ id: users.id });
    await tx.insert(consents).values({ merchantId: merchant!.id, purpose: "data_storage", granted: true });
    return {
      merchant: toMerchant(merchant!),
      membership: { userId: user!.id, merchantId: merchant!.id, role: "owner" },
    };
  });
}

export async function updateMerchantSettings(
  db: Db,
  merchantId: string,
  patch: MerchantSettingsPatch,
): Promise<Merchant> {
  const [row] = await db.update(merchants).set(patch).where(eq(merchants.id, merchantId)).returning();
  return toMerchant(row!);
}
