import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.js";
import {
  balanceOf,
  getCustomerDetail,
  listCustomers,
  softDeleteEntry,
  todaySummary,
} from "../db/repos/ledger.js";
import { AppError } from "../lib/errors.js";
import type { AuthGuards } from "../plugins/auth.js";

const uuid = z.string().uuid();
const notFound = () => new AppError(404, "NOT_FOUND", "Nahi mila (Not found)");

export function ledgerRoutes(app: FastifyInstance, db: Db, guards: AuthGuards) {
  // Customer list, highest due first (F1.5).
  app.get("/customers", { preHandler: guards.requireMerchant }, async (req) => ({
    customers: await listCustomers(db, req.membership!.merchantId),
  }));

  app.get<{ Params: { id: string } }>(
    "/customers/:id",
    { preHandler: guards.requireMerchant },
    async (req) => {
      if (!uuid.safeParse(req.params.id).success) throw notFound();
      const detail = await getCustomerDetail(db, req.membership!.merchantId, req.params.id);
      if (!detail) throw notFound();
      return detail;
    },
  );

  // Soft delete: Undo after a voice entry, or "last entry hata do" (F1.2).
  app.delete<{ Params: { id: string } }>(
    "/ledger/:id",
    { preHandler: guards.requireMerchant },
    async (req) => {
      if (!uuid.safeParse(req.params.id).success) throw notFound();
      const entry = await softDeleteEntry(db, req.membership!.merchantId, req.params.id);
      if (!entry) throw notFound();
      return {
        deleted: entry.id,
        balancePaise: entry.customerId ? await balanceOf(db, entry.customerId) : null,
      };
    },
  );

  // Home cards.
  app.get("/summary/today", { preHandler: guards.requireMerchant }, async (req) =>
    todaySummary(db, req.membership!.merchantId),
  );
}
