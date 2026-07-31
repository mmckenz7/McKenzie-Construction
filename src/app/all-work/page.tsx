"use client";

import { useRouter } from "next/navigation";

export default function AllWorkPage() {
  const router = useRouter();

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>
            McKenzie Construction
          </p>

          <h1 style={styles.heading}>
            All Work
          </h1>

          <p style={styles.subheading}>
            Your company-wide command center.
          </p>
        </div>

        <select
          defaultValue="/all-work"
          onChange={(event) =>
            router.push(event.target.value)
          }
          style={styles.selector}
          aria-label="Choose workspace"
        >
          <option value="/all-work">
            All Work
          </option>
          <option value="/sales">
            Sales
          </option>
          <option value="/operations">
            Operations
          </option>
          <option value="/admin">
            Administration
          </option>
          <option value="/workspace">
            Workspace selector
          </option>
        </select>
      </header>

      <section style={styles.grid}>
        <DashboardCard
          title="Sales"
          value="Lead activity"
          description="Follow-ups, appointments, estimates, and proposals needing attention."
          buttonText="Open Sales"
          onClick={() => router.push("/sales")}
        />

        <DashboardCard
          title="Operations"
          value="Project activity"
          description="Upcoming starts, installer availability, materials, and schedule issues."
          buttonText="Open Operations"
          onClick={() =>
            router.push("/operations")
          }
        />

        <DashboardCard
          title="Administration"
          value="Company settings"
          description="Pricing, suppliers, users, permissions, integrations, and financial controls."
          buttonText="Open Administration"
          onClick={() => router.push("/admin")}
        />
      </section>

      <section style={styles.placeholder}>
        <h2 style={styles.placeholderTitle}>
          Company priorities will appear here
        </h2>

        <p style={styles.placeholderText}>
          We will connect this dashboard to live
          leads, projects, installer messages,
          material deliveries, schedule conflicts,
          and financial information as each
          platform is completed.
        </p>
      </section>
    </main>
  );
}

function DashboardCard({
  title,
  value,
  description,
  buttonText,
  onClick,
}: {
  title: string;
  value: string;
  description: string;
  buttonText: string;
  onClick: () => void;
}) {
  return (
    <article style={styles.card}>
      <span style={styles.cardLabel}>
        {title}
      </span>

      <strong style={styles.cardValue}>
        {value}
      </strong>

      <p style={styles.cardDescription}>
        {description}
      </p>

      <button
        type="button"
        onClick={onClick}
        style={styles.button}
      >
        {buttonText}
      </button>
    </article>
  );
}

const styles: Record<
  string,
  React.CSSProperties
> = {
  page: {
    minHeight: "100vh",
    padding: "32px",
    background: "#f5f5f2",
  },
  header: {
    maxWidth: "1200px",
    margin: "0 auto 28px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "24px",
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: "0 0 6px",
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    opacity: 0.6,
  },
  heading: {
    margin: 0,
    fontSize: "42px",
  },
  subheading: {
    margin: "8px 0 0",
    opacity: 0.65,
  },
  selector: {
    minWidth: "210px",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(0,0,0,0.2)",
    background: "#ffffff",
    fontSize: "16px",
  },
  grid: {
    maxWidth: "1200px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "18px",
  },
  card: {
    padding: "24px",
    borderRadius: "16px",
    background: "#ffffff",
    border: "1px solid rgba(0,0,0,0.1)",
    boxShadow:
      "0 8px 24px rgba(0,0,0,0.05)",
  },
  cardLabel: {
    display: "block",
    marginBottom: "10px",
    fontSize: "14px",
    fontWeight: 700,
    opacity: 0.6,
  },
  cardValue: {
    display: "block",
    marginBottom: "10px",
    fontSize: "23px",
  },
  cardDescription: {
    minHeight: "72px",
    margin: 0,
    lineHeight: 1.5,
    opacity: 0.7,
  },
  button: {
    width: "100%",
    marginTop: "20px",
    padding: "12px 16px",
    border: 0,
    borderRadius: "10px",
    background: "#1d1d1b",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 700,
    cursor: "pointer",
  },
  placeholder: {
    maxWidth: "1200px",
    margin: "22px auto 0",
    padding: "28px",
    borderRadius: "16px",
    background: "#ffffff",
    border: "1px dashed rgba(0,0,0,0.2)",
  },
  placeholderTitle: {
    margin: "0 0 10px",
    fontSize: "22px",
  },
  placeholderText: {
    maxWidth: "760px",
    margin: 0,
    lineHeight: 1.6,
    opacity: 0.68,
  },
};
