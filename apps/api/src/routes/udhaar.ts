import { FundUdhaarBodySchema } from "@hisaab/shared";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import { getMerchant } from "../db/repos/merchants.js";
import { parseBody } from "../lib/errors.js";
import type { AuthGuards } from "../plugins/auth.js";
import { fund, overview } from "../udhaar/service.js";

// Udhaar-as-a-Service is a lending product: owner only, like credit.
export function udhaarRoutes(
  app: FastifyInstance,
  deps: { db: Db; guards: AuthGuards; payLinkBase: string },
) {
  const { db, guards, payLinkBase } = deps;

  app.get("/udhaar-service", { preHandler: guards.requireOwner }, async (req) =>
    overview(db, req.membership!.merchantId, payLinkBase),
  );

  app.post("/udhaar-service", { preHandler: guards.requireOwner }, async (req, reply) => {
    const body = parseBody(FundUdhaarBodySchema, req.body);
    const merchant = (await getMerchant(db, req.membership!.merchantId))!;
    const txn = await fund(db, merchant, body, payLinkBase, req.membership!.userId);
    return reply.code(201).send({ txn });
  });
}
