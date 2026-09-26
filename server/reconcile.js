export function reconcile(s) {
  const issues = {
    negativeBalances: 0,
    invalidStocks: 0,
    missingStudents: 0,
    approvalLedger: 0,
    redemptionLedger: 0,
    refundLedger: 0,
  };
  const students = new Set(s.students.map((x) => x.id)),
    balances = new Map(),
    related = new Map();
  for (const row of s.ledger) {
    balances.set(row.student, (balances.get(row.student) || 0) + row.amount);
    if (!students.has(row.student)) issues.missingStudents++;
    if (row.related) {
      const list = related.get(row.related) || [];
      list.push(row);
      related.set(row.related, list);
    }
  }
  issues.negativeBalances = [...balances.values()].filter(
    (x) => !Number.isSafeInteger(x) || x < 0,
  ).length;
  issues.invalidStocks = s.rewards.filter(
    (x) => !Number.isSafeInteger(x.stock) || x.stock < 0,
  ).length;
  for (const item of s.submissions)
    if (item.status === "Approved") {
      const rows = (related.get(item.id) || []).filter(
        (x) => x.type === "recycle",
      );
      if (rows.length !== 1 || rows[0].amount !== item.coins)
        issues.approvalLedger++;
    }
  for (const item of s.redemptions) {
    const rows = related.get(item.id) || [],
      debits = rows.filter((x) => x.type === "redemption"),
      refunds = rows.filter((x) => x.type === "refund");
    if (debits.length !== 1 || debits[0].amount !== -item.cost)
      issues.redemptionLedger++;
    if (
      item.status === "Cancelled"
        ? refunds.length !== 1 || refunds[0].amount !== item.cost
        : refunds.length !== 0
    )
      issues.refundLedger++;
  }
  return { ok: Object.values(issues).every((x) => x === 0), issues };
}
