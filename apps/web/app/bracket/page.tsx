import { Header } from "@/components/Header";
import { KnockoutBracket } from "@/components/KnockoutBracket";

export default function BracketPage() {
  return (
    <div className="shell">
      <Header />
      <main className="container" style={{ flex: 1 }}>
        <section style={{ padding: "32px 0 16px" }}>
          <div className="kicker">
            <span className="kicker-dot" />
            Round of 16 → Final
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: "12px 0 8px", letterSpacing: "-0.03em" }}>
            Knockout Bracket
          </h1>
          <p style={{ color: "var(--text-2)", maxWidth: 700, margin: 0, fontSize: 15 }}>
            Visual WC 2022 knockout tree. 16 matches across R16, QF, SF, and Final. Each match is an on-chain market
            you can stake on (head to the Match page to bet).
          </p>
        </section>
        <KnockoutBracket />
      </main>
    </div>
  );
}
