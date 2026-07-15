import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireMember } from "@/lib/authz";
import { recordSettlementSchema } from "@/lib/validation";
import { computeNetBalances, simplifyDebts } from "@/lib/debtSimplifier";

const toCents = (n: number) => Math.round(n * 100);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: groupId } = await params;

  const access = await requireMember(groupId, session.userId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const [members, expenses, settlementsMade] = await Promise.all([
    prisma.groupMember.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.expense.findMany({
      where: { groupId },
      include: { splits: true },
    }),
    prisma.settlement.findMany({ where: { groupId } }),
  ]);

  const balances = computeNetBalances({
    memberIds: members.map((m) => m.userId),
    expenses: expenses.map((e) => ({
      paidById: e.paidById,
      splits: e.splits.map((s) => ({ userId: s.userId, cents: toCents(Number(s.amount)) })),
    })),
    settlementsMade: settlementsMade.map((s) => ({
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      cents: toCents(Number(s.amount)),
    })),
  });

  const suggested = simplifyDebts(balances);
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.user.name ?? "Unknown";

  return NextResponse.json({
    balances: balances.map((b) => ({ userId: b.userId, name: nameOf(b.userId), dollars: b.cents / 100 })),
    suggestedSettlements: suggested.map((s) => ({
      fromUserId: s.fromUserId,
      fromName: nameOf(s.fromUserId),
      toUserId: s.toUserId,
      toName: nameOf(s.toUserId),
      dollars: s.cents / 100,
    })),
  });
}

// Record that a real payment happened (e.g. "I Venmo'd Sam $20").
// This doesn't move money — it's a ledger entry the group can see, so
// balances update without needing a payment processor integration.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: groupId } = await params;

  const access = await requireMember(groupId, session.userId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json().catch(() => null);
  const parsed = recordSettlementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const memberIds = new Set(
    (await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } })).map(
      (m) => m.userId
    )
  );
  if (!memberIds.has(parsed.data.fromUserId) || !memberIds.has(parsed.data.toUserId)) {
    return NextResponse.json({ error: "Both users must be members of this group" }, { status: 400 });
  }

  const settlement = await prisma.settlement.create({
    data: { groupId, ...parsed.data },
  });

  return NextResponse.json({ settlement }, { status: 201 });
}
