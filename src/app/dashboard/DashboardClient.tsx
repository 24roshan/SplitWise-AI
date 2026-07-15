"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type GroupSummary = {
  id: string;
  name: string;
  currency: string;
  memberCount: number;
  expenseCount: number;
  members: string[];
};

export default function DashboardClient({
  userName,
  initialGroups,
}: {
  userName: string;
  initialGroups: GroupSummary[];
}) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, currency: "USD" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create group");
        return;
      }
      router.push(`/groups/${data.group.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <main className="max-w-3xl mx-auto px-6 pt-16 pb-16">
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="font-mono-num text-xs tracking-widest text-moss uppercase mb-1">Dashboard</p>
          <h1 className="font-display text-3xl">Hi, {userName}</h1>
        </div>
        <button onClick={logout} className="text-sm text-ink/60 hover:text-clay underline underline-offset-4">
          Sign out
        </button>
      </div>

      <form onSubmit={createGroup} className="flex gap-3 mb-10">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New group name, e.g. Goa Trip"
          className="flex-1 border border-line rounded-md px-3 py-2.5 bg-white"
        />
        <button
          disabled={creating}
          className="bg-moss text-paper px-5 rounded-md font-medium hover:bg-ink transition-colors disabled:opacity-60"
        >
          {creating ? "Creating…" : "New group"}
        </button>
      </form>
      {error && <p className="text-clay text-sm -mt-6 mb-6">{error}</p>}

      <div className="ledger-rule pt-6">
        {groups.length === 0 ? (
          <p className="text-ink/60 text-sm">
            No groups yet. Create one above to start splitting expenses.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="flex items-center justify-between border border-line rounded-lg px-4 py-3 hover:border-moss transition-colors bg-white"
                >
                  <div>
                    <p className="font-medium">{g.name}</p>
                    <p className="text-xs text-ink/50 mt-0.5">{g.members.join(", ")}</p>
                  </div>
                  <p className="font-mono-num text-sm text-ink/60">{g.expenseCount} expenses</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
