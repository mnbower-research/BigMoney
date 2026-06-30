interface StatCardProps {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning";
}

export function StatCard({ label, value, tone = "default" }: StatCardProps) {
  return (
    <article className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
