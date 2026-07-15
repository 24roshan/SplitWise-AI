import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireMember } from "@/lib/authz";
import { createExpenseSchema } from "@/lib/validation";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: groupId } = await params;

  const access = await requireMember(groupId, session.userId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json().catch(() => null);
  const parsed = createExpenseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const data = parsed.data;

  // Server-side authorization: don't trust the client's list of participant
  // IDs — everyone named (payer + every split) must actually belong to this
  // group, otherwise a malicious client could attribute an expense to, or
  // split a bill onto, an unrelated user account.
  const memberIds = new Set(
    (await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } })).map(
      (m) => m.userId
    )
  );
  const allParticipants = [data.paidById, ...data.splits.map((s) => s.userId)];
  const invalid = allParticipants.find((uid) => !memberIds.has(uid));
  if (invalid) {
    return NextResponse.json(
      { error: "One or more participants are not members of this group" },
      { status: 400 }
    );
  }

  const expense = await prisma.expense.create({
    data: {
      groupId,
      description: data.description,
      amount: data.amount,
      splitType: data.splitType,
      paidById: data.paidById,
      addedById: session.userId,
      splits: {
        create: data.splits.map((s) => ({ userId: s.userId, amount: s.amount })),
      },
    },
    include: { splits: true, paidBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({ expense }, { status: 201 });
}
