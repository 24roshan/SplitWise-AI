import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user, groups] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } }),
    prisma.group.findMany({
      where: { members: { some: { userId: session.userId } } },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
        _count: { select: { expenses: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const serializedGroups = groups.map((g) => ({
    id: g.id,
    name: g.name,
    currency: g.currency,
    memberCount: g.members.length,
    expenseCount: g._count.expenses,
    members: g.members.map((m) => m.user.name),
  }));

  return <DashboardClient userName={user?.name ?? "there"} initialGroups={serializedGroups} />;
}
