import { gradeClass } from "../../lib/lolesports/format";

export default function GradeBadge({
  label,
  grade,
}: {
  label: string;
  grade: string | null | undefined;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-3 py-2 rounded-sm border min-w-[72px] ${gradeClass(
        grade,
      )}`}
    >
      <span className="text-[9px] uppercase tracking-[0.2em] opacity-80">{label}</span>
      <span className="text-2xl font-bold leading-none mt-1">{grade ?? "—"}</span>
    </div>
  );
}
