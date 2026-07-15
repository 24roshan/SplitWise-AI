import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto px-6 pt-24 pb-16">
      <p className="font-mono-num text-xs tracking-widest text-moss uppercase mb-6">
        Ledger — no.1 group ledger
      </p>
      <h1 className="font-display text-5xl sm:text-6xl leading-[1.05] mb-6">
        Split the bill.
        <br />
        <span className="italic text-clay">Skip the math.</span>
      </h1>
      <p className="text-lg text-ink/80 max-w-xl mb-10">
        Photograph a receipt and Ledger reads the line items for you. When it&rsquo;s time to
        settle up, it collapses everyone&rsquo;s tangled debts into the fewest possible payments —
        not just a running total.
      </p>
      <div className="flex gap-4">
        <Link
          href="/register"
          className="bg-moss text-paper px-6 py-3 rounded-md font-medium hover:bg-ink transition-colors"
        >
          Create an account
        </Link>
        <Link
          href="/login"
          className="border border-line px-6 py-3 rounded-md font-medium hover:border-ink transition-colors"
        >
          Sign in
        </Link>
      </div>

      <div className="mt-20 ledger-rule pt-6 grid sm:grid-cols-3 gap-8 text-sm">
        <div>
          <p className="font-display text-2xl mb-1">01</p>
          <p className="text-ink/70">Snap a photo of any receipt — AI itemizes it automatically.</p>
        </div>
        <div>
          <p className="font-display text-2xl mb-1">02</p>
          <p className="text-ink/70">Split by item, by share, or evenly across your group.</p>
        </div>
        <div>
          <p className="font-display text-2xl mb-1">03</p>
          <p className="text-ink/70">
            Settle up with a minimized set of payments — never more than N&minus;1 transactions.
          </p>
        </div>
      </div>
    </main>
  );
}
