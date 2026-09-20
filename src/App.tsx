import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import type { AppState } from "./domain/types";
import { loadState, resetState, saveState } from "./domain/storage";
import { integrityChecks, type Result } from "./domain/rules";
import { TrenchBoard } from "./components/TrenchBoard";
import { Forms } from "./components/Forms";
import { Ledger } from "./components/Ledger";

const project = {
  id: "hxwl-10",
  port: 5110,
  title: "考古探方记录",
  subtitle: "班组每日进尺上报、遗迹保护停挖复挖与地层验收更正闭环档案",
};

interface ToastState {
  kind: "ok" | "err";
  text: string;
  stamp: number;
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [toast, setToast] = useState<ToastState | null>(null);

  // 每次变更即落盘：刷新后探方、班组、停挖、交接和更正链保持一致
  useEffect(() => {
    saveState(state);
  }, [state]);

  function apply(result: Result, successMsg: string) {
    if (result.ok) {
      setState(result.state);
      setToast({ kind: "ok", text: successMsg, stamp: Date.now() });
    } else {
      setToast({ kind: "err", text: result.issues.map((i) => i.message).join("；"), stamp: Date.now() });
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function reset() {
    setState(resetState());
    setToast({ kind: "ok", text: "已恢复演示初始档案", stamp: Date.now() });
  }

  const metrics = useMemo(() => {
    const halted = state.trenches.filter((t) => t.status === "halted").length;
    const openFeatures = state.features.filter((f) => !f.protectionRegistered).length;
    const checks = integrityChecks(state);
    const badChecks = checks.filter((c) => !c.ok).length;
    return [
      { label: "探方数", value: String(state.trenches.length), tone: "ok" },
      { label: "保护停挖", value: String(halted), tone: halted ? "danger" : "ok" },
      { label: "进尺记录", value: String(state.reports.length), tone: "ok" },
      { label: "未登记保护遗迹", value: String(openFeatures), tone: openFeatures ? "danger" : "watch" },
      { label: "交接 / 更正", value: `${state.handovers.length} / ${state.corrections.length}`, tone: "watch" },
      { label: "链路异常", value: String(badChecks), tone: badChecks ? "danger" : "ok" },
    ];
  }, [state]);

  return (
    <main className="app-shell">
      {toast && (
        <div className={`toast-wrap ${toast.kind}`} key={toast.stamp}>
          {toast.kind === "ok" ? "✓ " : "⛔ "}
          {toast.text}
        </div>
      )}

      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>闭环流程</span>
          <strong>进尺上报 → 发现遗迹停挖 → 登记保护措施 →（换班组则交接）→ 复挖；验收地层只读、更正留痕</strong>
          <button className="reset-btn" onClick={reset}>恢复演示数据</button>
        </div>
      </section>

      <section className="metrics-grid metrics-grid-6">
        {metrics.map((m) => (
          <article className="metric-card" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={`status-${m.tone}`} />
          </article>
        ))}
      </section>

      <Forms state={state} apply={apply} />
      <TrenchBoard state={state} />
      <Ledger state={state} />

      <footer className="page-foot">
        领域数据（src/domain）、校验规则（src/domain/rules.ts）与页面（src/components、App.tsx）分开实现 ·
        数据保存在浏览器本地，刷新后一致 · 未新增任何依赖
      </footer>
    </main>
  );
}

export default App;
