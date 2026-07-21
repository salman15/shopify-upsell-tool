import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import { recordEvent } from "../lib/upsell/rules.server";
import { log } from "../lib/logger.server";

const eventSchema = z.object({
  ruleId: z.string().min(1),
  type: z.enum(["shown", "accepted", "dismissed"]),
  cartToken: z.string().optional(),
});

// Public endpoint (behind App Proxy signature verification) for storefront
// impression/conversion tracking. POST /apps/upsell/events
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return Response.json({ ok: false }, { status: 404 });

  const body = await request.json().catch(() => null);
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ ok: false, errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await recordEvent(parsed.data.ruleId, session.shop, parsed.data.type, parsed.data.cartToken);
  } catch (error) {
    log.warn(`[apps.upsell.events] failed to record event: ${(error as Error).message}`);
  }

  return Response.json({ ok: true });
};
