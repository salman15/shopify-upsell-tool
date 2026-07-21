import prisma from "../../db.server";

export type RuleStats = {
  ruleId: string;
  name: string;
  toolType: string;
  enabled: boolean;
  shown: number;
  accepted: number;
  dismissed: number;
  conversionRate: number | null;
};

// Aggregates UpsellEvent counts per rule for the analytics dashboard.
// Rules with no events yet still appear, with all counts at zero.
export async function getRuleStats(shop: string): Promise<RuleStats[]> {
  const [rules, grouped] = await Promise.all([
    prisma.upsellRule.findMany({
      where: { shop },
      select: { id: true, name: true, toolType: true, enabled: true },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    }),
    prisma.upsellEvent.groupBy({
      by: ["ruleId", "type"],
      where: { shop },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    const perRule = counts.get(row.ruleId) ?? {};
    perRule[row.type] = row._count._all;
    counts.set(row.ruleId, perRule);
  }

  return rules.map((rule) => {
    const perRule = counts.get(rule.id) ?? {};
    const shown = perRule.shown ?? 0;
    const accepted = perRule.accepted ?? 0;
    const dismissed = perRule.dismissed ?? 0;
    return {
      ruleId: rule.id,
      name: rule.name,
      toolType: rule.toolType,
      enabled: rule.enabled,
      shown,
      accepted,
      dismissed,
      conversionRate: shown > 0 ? accepted / shown : null,
    };
  });
}
