import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { customerProfile, recordConsent } from "../network/profile.js";
import type { AuthGuards } from "../plugins/auth.js";
import type { AiServices } from "../services/types.js";

const uuid = z.string().uuid();
const notFound = () => new AppError(404, "NOT_FOUND", "Nahi mila (Not found)");

// Paytm customer profile: credit information, so owner only (helpers can't see credit, §16).
export function networkRoutes(app: FastifyInstance, deps: { db: Db; ai: AiServices; guards: AuthGuards }) {
  const { db, ai, guards } = deps;

  app.get<{ Params: { id: string } }>(
    "/customers/:id/network-profile",
    { preHandler: guards.requireOwner },
    async (req) => {
      if (!uuid.safeParse(req.params.id).success) throw notFound();
      const profile = await customerProfile(db, ai, req.membership!.merchantId, req.params.id, req.log);
      if (!profile) throw notFound();
      return profile;
    },
  );

  // Mock consent: stands in for the customer approving an OTP or link on their own phone.
  app.post<{ Params: { id: string } }>(
    "/customers/:id/network-consent",
    { preHandler: guards.requireOwner },
    async (req) => {
      if (!uuid.safeParse(req.params.id).success) throw notFound();
      if (!(await recordConsent(db, req.membership!.merchantId, req.params.id))) {
        throw new AppError(
          422,
          "NO_PHONE",
          "Customer ka phone number nahi hai (Add the customer's phone first)",
        );
      }
      return { ok: true };
    },
  );
}
