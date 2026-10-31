import { CreateMerchantBodySchema, MerchantSettingsPatchSchema, type MeResponse } from "@hisaab/shared";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import {
  createMerchantWithOwner,
  findMembership,
  getMerchant,
  updateMerchantSettings,
} from "../db/repos/merchants.js";
import { AppError, parseBody } from "../lib/errors.js";
import type { AuthGuards } from "../plugins/auth.js";

export function merchantRoutes(app: FastifyInstance, db: Db, guards: AuthGuards) {
  // Who am I, and which shop? merchant/membership are null until onboarding.
  app.get("/me", { preHandler: guards.authenticate }, async (req): Promise<MeResponse> => {
    const authUser = req.authUser!;
    const membership = await findMembership(db, authUser.id);
    const merchant = membership ? await getMerchant(db, membership.merchantId) : null;
    return {
      user: { authUserId: authUser.id, email: authUser.email },
      membership: membership ? { userId: membership.userId, role: membership.role } : null,
      merchant,
    };
  });

  // Onboarding (F0): create the shop; the signed-in user becomes its owner.
  app.post("/merchants", { preHandler: guards.authenticate }, async (req, reply) => {
    const body = parseBody(CreateMerchantBodySchema, req.body);
    if (await findMembership(db, req.authUser!.id)) {
      throw new AppError(
        409,
        "ALREADY_ONBOARDED",
        "Aapki dukaan pehle se bani hui hai (Shop already set up)",
      );
    }
    const { merchant, membership } = await createMerchantWithOwner(db, body, {
      authUserId: req.authUser!.id,
      email: req.authUser!.email,
    });
    req.log.info({ merchantId: merchant.id }, "merchant onboarded");
    return reply
      .code(201)
      .send({ merchant, membership: { userId: membership.userId, role: membership.role } });
  });

  // Settings (F11): owner only.
  app.patch("/me/settings", { preHandler: guards.requireOwner }, async (req) => {
    const patch = parseBody(MerchantSettingsPatchSchema, req.body);
    return { merchant: await updateMerchantSettings(db, req.membership!.merchantId, patch) };
  });
}
