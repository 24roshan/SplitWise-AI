import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import GroupClient from "./GroupClient";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId: id, userId: session.userId } },
  });
  if (!membership) notFound(); // don't reveal whether the group exists to non-members

  const group = await prisma.group.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      expenses: {
        include: {
          paidBy: { select: { id: true, name: true } },
          addedBy: { select: { id: true, name: true } },
          splits: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!group) notFound();

  const serialized = {
    id: group.id,
    name: group.name,
    currency: group.currency,
    members: group.members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, role: m.role })),
    expenses: group.expenses.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      splitType: e.splitType,
      paidBy: e.paidBy,
      addedBy: e.addedBy,
      aiParsed: e.aiParsed,
      createdAt: e.createdAt.toISOString(),
      splits: e.splits.map((s) => ({ userId: s.userId, name: s.user.name, amount: Number(s.amount) })),
    })),
  };

  return (
    <GroupClient
      group={serialized}
      currentUserId={session.userId}
      currentUserRole={membership.role}
    />
  );
}
