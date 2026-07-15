import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireMember } from "@/lib/authz";

// Only the person who originally added the expense, or a group admin, may
// edit/delete it. This prevents any member from silently rewriting the
// ledger for expenses they weren't responsible for.
async function canModify(groupId: string, expenseId: string, userId: string) {
  const access = await requireMember(groupId, userId);
  if (!access.ok) return { ok: false as const, status: access.status, error: access.error };

  const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!expense || expense.groupId !== groupId) {
    return { ok: false as const, status: 404, error: "Expense not found" };
  }

  if (expense.addedById !== userId && access.membership.role !== "ADMIN") {
    return { ok: false as const, status: 403, error: "Only the person who added this expense, or a group admin, can modify it" };
  }

  return { ok: true as const, expense };
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: groupId, expenseId } = await params;

  const check = await canModify(groupId, expenseId, session.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  await prisma.expense.delete({ where: { id: expenseId } });
  return NextResponse.json({ ok: true });
}
