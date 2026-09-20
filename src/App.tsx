import "./styles.css";
import { STORAGE_KEY } from "./domain/seed";
import { dispatch, useArchive } from "./state/store";
import { UnitSidebar } from "./ui/UnitSidebar";
import { ProgressPanel } from "./ui/ProgressPanel";
import { FeaturePanel } from "./ui/FeaturePanel";
import { ProtectionResumePanel } from "./ui/ProtectionResumePanel";
import { StrataPanel } from "./ui/StrataPanel";
import { RecordsPanel } from "./ui/RecordsPanel";

const statusTone = ["ok", "warn", "danger", "muted"] as const;

function MetricCard({ label, value, sub, index }: { label: string; value: string; sub?: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <em className="metric-sub">{sub}</em>}
      <i className={`status-${statusTone[index % statusTone.length]}`} />
    </article>
  );
}

function App() {
  const s = useArchive();
  const haltedCount = s.units.filter((u) => u.status === "halted").length;
  const activeFeatureCount = s.features.filter((f) => f.status === "active").length;
  const correctionCount = s.corrections.length;
  const handoverCount = s.handovers.length;

  const reset = () => {
    if (window.confirm("确定恢复为示例档案？当前所有上报、停挖、交接与更正记录将被重置。")) {
      localStorage.removeItem(STORAGE_KEY);
      dispatch({ type: "reset" });
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-10 · 考古探方记录 · port 5110</p>
          <h1>发掘班组交接与遗迹保护闭环</h1>
          <p className="subtitle">
            每日进尺上报 → 发现遗迹保护停挖 → 登记保护措施 → 班组交接复挖 → 地层验收只读与更正链。
            领域数据、校验规则与页面分层实现，数据本地持久化，刷新后探方、班组、停挖、交接与更正链保持一致。
          </p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>React + Vite + TypeScript + CSS（不增加依赖）</strong>
          <span>分层</span>
          <strong>domain 领域数据 / rules 校验规则 / state 状态 / ui 页面</strong>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard index={0} label="探方" value={String(s.units.length)} sub={`保护停挖 ${haltedCount} 个`} />
        <MetricCard index={1} label="遗迹单位" value={String(s.features.length)} sub={`保护中 ${activeFeatureCount} 个`} />
        <MetricCard index={2} label="班组交接" value={String(handoverCount)} sub="更换班组复挖均留痕" />
        <MetricCard index={3} label="地层更正记录" value={String(correctionCount)} sub="验收后历史数值可查" />
      </section>

      <section className="workspace">
        <aside className="narrow">
          <UnitSidebar />
        </aside>
        <div className="main-panels">
          <ProgressPanel />
          <FeaturePanel />
          <ProtectionResumePanel />
        </div>
      </section>

      <StrataPanel />
      <RecordsPanel />

      <footer className="app-footer">
        <span>档案保存在本机浏览器（localStorage · {STORAGE_KEY}），刷新后状态一致。</span>
        <button onClick={reset}>恢复示例档案</button>
      </footer>
    </main>
  );
}

export default App;
