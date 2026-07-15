"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = { id: string; name: string; email: string; role: "ADMIN" | "MEMBER" };
type Split = { userId: string; name: string; amount: number };
type Expense = {
  id: string;
  description: string;
  amount: number;
  splitType: "EQUAL" | "PERCENTAGE" | "EXACT" | "SHARES";
  paidBy: { id: string; name: string };
  addedBy: { id: string; name: string };
  aiParsed: boolean;
  createdAt: string;
  splits: Split[];
};
type Group = {
  id: string;
  name: string;
  currency: string;
  members: Member[];
  expenses: Expense[];
};

type Balance = { userId: string; name: string; dollars: number };
type SuggestedSettlement = { fromUserId: string; fromName: string; toUserId: string; toName: string; dollars: number };

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GroupClient({
  group,
  currentUserId,
  currentUserRole,
}: {
  group: Group;
  currentUserId: string;
  currentUserRole: "ADMIN" | "MEMBER";
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"expenses" | "settle" | "members">("expenses");
  const [expenses, setExpenses] = useState(group.expenses);

  // --- Add expense form state ---
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidById, setPaidById] = useState(currentUserId);
  const [splitType, setSplitType] = useState<Expense["splitType"]>("EQUAL");
  const [participants, setParticipants] = useState<string[]>(group.members.map((m) => m.id));
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // --- Receipt AI parsing state ---
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);

  // --- Settlement state ---
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [suggested, setSuggested] = useState<SuggestedSettlement[] | null>(null);
  const [loadingSettle, setLoadingSettle] = useState(false);

  // --- Members state ---
  const [members, setMembers] = useState(group.members);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  function toggleParticipant(id: string) {
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function computeSplits(): { userId: string; amount: number }[] | null {
    const total = parseFloat(amount);
    if (!total || total <= 0 || participants.length === 0) return null;

    if (splitType === "EQUAL") {
      const share = Math.floor((total / participants.length) * 100) / 100;
      const splits = participants.map((userId) => ({ userId, amount: share }));
      // Assign any leftover cents (from flooring) to the first participant so
      // the sum matches the total exactly.
      const remainder = Math.round((total - share * participants.length) * 100) / 100;
      splits[0].amount = Math.round((splits[0].amount + remainder) * 100) / 100;
      return splits;
    }

    if (splitType === "EXACT") {
      const splits = participants.map((userId) => ({
        userId,
        amount: parseFloat(exactAmounts[userId] ?? "0") || 0,
      }));
      return splits;
    }

    return null; // PERCENTAGE/SHARES omitted from this quick form for brevity
  }

  async function submitExpense(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const splits = computeSplits();
    if (!splits) {
      setError("Check that the amount and participants are set correctly.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          amount: parseFloat(amount),
          splitType,
          paidById,
          splits,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not add expense");
        return;
      }
      router.refresh();
      setExpenses((prev) => [
        {
          ...data.expense,
          paidBy: members.find((m) => m.id === paidById)!,
          addedBy: members.find((m) => m.id === currentUserId)!,
          splits: splits.map((s) => ({ ...s, name: members.find((m) => m.id === s.userId)?.name ?? "" })),
        },
        ...prev,
      ]);
      setDescription("");
      setAmount("");
      setExactAmounts({});
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteExpense(id: string) {
    const res = await fetch(`/api/groups/${group.id}/expenses/${id}`, { method: "DELETE" });
    if (res.ok) setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  async function onReceiptSelected(file: File) {
    setParsing(true);
    setParseNote(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/receipts/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseNote(data.error ?? "Could not parse receipt. Enter details manually.");
        return;
      }
      const receipt = data.receipt as { merchant: string | null; total: number; items: { label: string; amount: number }[] };
      setDescription(receipt.merchant ?? "Receipt");
      setAmount(String(receipt.total));
      setParseNote(
        `Read ${receipt.items.length} item(s) totaling ${group.currency} ${fmt(receipt.total)}. Review before saving.`
      );
    } finally {
      setParsing(false);
    }
  }

  async function loadSettlements() {
    setLoadingSettle(true);
    try {
      const res = await fetch(`/api/groups/${group.id}/settle`);
      const data = await res.json();
      setBalances(data.balances);
      setSuggested(data.suggestedSettlements);
    } finally {
      setLoadingSettle(false);
    }
  }

  async function recordSettlement(fromUserId: string, toUserId: string, dollars: number) {
    await fetch(`/api/groups/${group.id}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUserId, toUserId, amount: dollars }),
    });
    loadSettlements();
  }

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    const res = await fetch(`/api/groups/${group.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const data = await res.json();
    if (!res.ok) {
      setInviteError(data.error ?? "Could not add member");
      return;
    }
    setMembers((prev) => [...prev, { ...data.member.user, role: "MEMBER" }]);
    setInviteEmail("");
  }

  return (
    <main className="max-w-3xl mx-auto px-6 pt-16 pb-16">
      <p className="font-mono-num text-xs tracking-widest text-moss uppercase mb-1">Group</p>
      <h1 className="font-display text-3xl mb-8">{group.name}</h1>

      <div className="flex gap-6 border-b border-line mb-8 text-sm">
        {(["expenses", "settle", "members"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "settle") loadSettlements();
            }}
            className={`pb-3 -mb-px border-b-2 transition-colors capitalize ${
              tab === t ? "border-clay text-ink font-medium" : "border-transparent text-ink/50"
            }`}
          >
            {t === "settle" ? "Settle up" : t}
          </button>
        ))}
      </div>

      {tab === "expenses" && (
        <div>
          <form onSubmit={submitExpense} className="border border-line rounded-lg p-5 bg-white mb-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Scan a receipt (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onReceiptSelected(e.target.files[0])}
                className="text-sm"
              />
              {parsing && <p className="text-xs text-ink/50">Reading receipt…</p>}
              {parseNote && <p className="text-xs text-moss">{parseNote}</p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm">
                Description
                <input
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="border border-line rounded-md px-3 py-2"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Amount ({group.currency})
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="border border-line rounded-md px-3 py-2 font-mono-num"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              Paid by
              <select
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
                className="border border-line rounded-md px-3 py-2"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <p className="text-sm font-medium mb-2">Split</p>
              <div className="flex gap-2 mb-3">
                {(["EQUAL", "EXACT"] as const).map((st) => (
                  <button
                    type="button"
                    key={st}
                    onClick={() => setSplitType(st)}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      splitType === st ? "bg-moss text-paper border-moss" : "border-line text-ink/60"
                    }`}
                  >
                    {st === "EQUAL" ? "Split equally" : "Exact amounts"}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={participants.includes(m.id)}
                      onChange={() => toggleParticipant(m.id)}
                    />
                    <span className="w-32">{m.name}</span>
                    {splitType === "EXACT" && participants.includes(m.id) && (
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={exactAmounts[m.id] ?? ""}
                        onChange={(e) => setExactAmounts((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        className="border border-line rounded-md px-2 py-1 w-24 font-mono-num text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-clay text-sm">{error}</p>}

            <button
              disabled={submitting}
              className="bg-moss text-paper rounded-md py-2.5 font-medium hover:bg-ink transition-colors disabled:opacity-60"
            >
              {submitting ? "Adding…" : "Add expense"}
            </button>
          </form>

          <div className="ledger-rule pt-6 flex flex-col gap-4">
            {expenses.length === 0 && <p className="text-ink/60 text-sm">No expenses logged yet.</p>}
            {expenses.map((e) => (
              <div key={e.id} className="border border-line rounded-lg p-4 bg-white">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{e.description}</p>
                    <p className="text-xs text-ink/50">
                      Paid by {e.paidBy.name} · added by {e.addedBy.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono-num font-medium">
                      {group.currency} {fmt(e.amount)}
                    </p>
                    {(e.addedBy.id === currentUserId || currentUserRole === "ADMIN") && (
                      <button
                        onClick={() => deleteExpense(e.id)}
                        className="text-xs text-clay hover:underline mt-1"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-ink/50 mt-2">
                  {e.splits.map((s) => `${s.name}: ${fmt(s.amount)}`).join("  ·  ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "settle" && (
        <div>
          {loadingSettle && <p className="text-sm text-ink/60">Calculating…</p>}
          {!loadingSettle && balances && (
            <div className="flex flex-col gap-8">
              <div>
                <h2 className="font-display text-xl mb-3">Current balances</h2>
                <div className="flex flex-col gap-2">
                  {balances.map((b) => (
                    <div key={b.userId} className="flex justify-between border-b border-line pb-2 text-sm">
                      <span>{b.name}</span>
                      <span className={`font-mono-num ${b.dollars >= 0 ? "text-moss" : "text-clay"}`}>
                        {b.dollars >= 0 ? "is owed " : "owes "}
                        {group.currency} {fmt(Math.abs(b.dollars))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="font-display text-xl mb-1">Suggested settlements</h2>
                <p className="text-xs text-ink/50 mb-3">
                  Minimized to the fewest possible transactions — not a naive pairwise payoff.
                </p>
                {suggested && suggested.length === 0 && (
                  <p className="text-sm text-ink/60">Everyone is settled up. 🎉</p>
                )}
                <div className="flex flex-col gap-2">
                  {suggested?.map((s, i) => (
                    <div key={i} className="flex items-center justify-between border border-line rounded-lg px-4 py-3 bg-white">
                      <p className="text-sm">
                        <span className="font-medium">{s.fromName}</span> pays{" "}
                        <span className="font-medium">{s.toName}</span>
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-num text-sm">
                          {group.currency} {fmt(s.dollars)}
                        </span>
                        <button
                          onClick={() => recordSettlement(s.fromUserId, s.toUserId, s.dollars)}
                          className="text-xs bg-moss text-paper px-3 py-1.5 rounded-full hover:bg-ink"
                        >
                          Mark paid
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "members" && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between border border-line rounded-lg px-4 py-3 bg-white text-sm">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-ink/50">{m.email}</p>
                </div>
                <span className="text-xs uppercase tracking-wide text-ink/50">{m.role}</span>
              </div>
            ))}
          </div>

          {currentUserRole === "ADMIN" && (
            <form onSubmit={inviteMember} className="flex gap-3">
              <input
                type="email"
                required
                placeholder="Invite by email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 border border-line rounded-md px-3 py-2 bg-white text-sm"
              />
              <button className="bg-moss text-paper px-4 rounded-md text-sm font-medium hover:bg-ink">
                Add
              </button>
            </form>
          )}
          {inviteError && <p className="text-clay text-sm">{inviteError}</p>}
        </div>
      )}
    </main>
  );
}
