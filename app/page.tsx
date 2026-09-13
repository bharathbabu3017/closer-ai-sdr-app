import { desc } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { leads } from "@/src/db/schema";

export const dynamic = "force-dynamic";

const tierStyles: Record<string, string> = {
  hot: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  warm: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  cold: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  spam: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default function Home() {
  const rows = getDb().select().from(leads).orderBy(desc(leads.createdAt)).limit(100).all();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Closer</h1>
      <p className="mt-1 text-sm text-zinc-500">Inbound leads handled by the agent. The full dashboard lands in Phase 5.</p>

      <div className="mt-8 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 font-medium">Lead</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Stage</th>
              <th className="px-4 py-2 font-medium">Score</th>
              <th className="px-4 py-2 font-medium">Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  No leads yet. Run <code className="font-mono">npm run simulate hot</code> to send one.
                </td>
              </tr>
            )}
            {rows.map((lead) => (
              <tr key={lead.id} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-2">
                  <div className="font-medium">{lead.name ?? lead.email}</div>
                  <div className="text-xs text-zinc-500">{lead.email}</div>
                </td>
                <td className="px-4 py-2">{lead.company ?? "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{lead.stage}</td>
                <td className="px-4 py-2">
                  {lead.tier ? (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tierStyles[lead.tier]}`}>
                      {lead.tier} · {lead.score}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-500">{lead.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
