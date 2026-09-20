import type { AppState } from "../domain/types";
import { correctionFieldLabels, crewName, integrityChecks } from "../domain/rules";

function stratumCode(state: AppState, id: string): string {
  return state.strata.find((s) => s.id === id)?.code ?? id;
}

export function Ledger({ state }: { state: AppState }) {
  const checks = integrityChecks(state);
  const reports = [...state.reports].sort((a, b) => b.createdAt - a.createdAt);
  const features = [...state.features].sort((a, b) => (a.date < b.date ? 1 : -1));
  const handovers = [...state.handovers].sort((a, b) => b.createdAt - a.createdAt);
  const corrections = [...state.corrections].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <section className="panel ledger">
      <div className="section-heading">
        <div>
          <p>档案台账</p>
          <h2>刷新后链路一致性自检</h2>
        </div>
      </div>

      <div className="check-grid">
        {checks.map((c) => (
          <div key={c.key} className={`check-item ${c.ok ? "ok" : "bad"}`}>
            <span className="check-dot">{c.ok ? "✓" : "!"}</span>
            <div>
              <b>{c.label}</b>
              <p>{c.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="ledger-cols">
        <div>
          <h3>进尺记录（永久绑定上报班组）</h3>
          <ol className="ledger-list">
            {reports.map((r) => (
              <li key={r.id}>
                <div className="ledger-head">
                  <b>{r.date}</b>
                  <span className="tag">{r.trenchId} · {stratumCode(state, r.stratumId)}</span>
                  <span className="tag tag-crew">{crewName(state, r.crewId)} · {r.supervisor}</span>
                </div>
                <p>
                  深度 {r.startDepth}–{r.endDepth}cm（进尺 {r.advance}cm）
                  {r.crossedStrata ? ` · 跨层补记：${r.crossedStrata}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3>发现记录（永久绑定发现班组）</h3>
          <ol className="ledger-list">
            {features.map((f) => (
              <li key={f.id}>
                <div className="ledger-head">
                  <b>{f.code} · {f.kind}</b>
                  <span className="tag">{f.trenchId} · {f.depth}cm</span>
                  <span className="tag tag-crew">{crewName(state, f.crewId)}</span>
                </div>
                <p>
                  {f.date} 发现 · {f.description || "—"}
                </p>
                <p className={f.protectionRegistered ? "line-ok" : "line-warn"}>
                  {f.protectionRegistered
                    ? `保护：${f.protectionNote}（${f.protectedAt} 登记${f.resumedAt ? `，${f.resumedAt} 复挖` : ""}）`
                    : "保护措施未登记 —— 探方禁止复挖"}
                </p>
              </li>
            ))}
            {features.length === 0 && <p className="empty-line">暂无</p>}
          </ol>
        </div>

        <div>
          <h3>交接记录</h3>
          <ol className="ledger-list">
            {handovers.map((h) => (
              <li key={h.id}>
                <div className="ledger-head">
                  <b>{h.date}</b>
                  <span className="tag">{h.trenchId}</span>
                  <span className="tag tag-crew">{crewName(state, h.fromCrewId)} → {crewName(state, h.toCrewId)}</span>
                </div>
                <p>未完坐标：{h.pendingCoordinates}</p>
                <p>出土物暂存点：{h.artifactStaging}</p>
                {h.note && <p>备注：{h.note}</p>}
              </li>
            ))}
            {handovers.length === 0 && <p className="empty-line">暂无</p>}
          </ol>
        </div>

        <div>
          <h3>更正记录（原值可查）</h3>
          <ol className="ledger-list">
            {corrections.map((c) => (
              <li key={c.id}>
                <div className="ledger-head">
                  <b>{c.date}</b>
                  <span className="tag">{state.strata.find((s) => s.id === c.stratumId)?.trenchId ?? ""} · {stratumCode(state, c.stratumId)}</span>
                  <span className="tag tag-crew">{correctionFieldLabels[c.field]}</span>
                </div>
                <p>
                  <del className="old-value">{c.oldValue}</del> <span className="arrow">→</span> {c.newValue}
                </p>
                <p className="reason">原因：{c.reason}</p>
              </li>
            ))}
            {corrections.length === 0 && <p className="empty-line">暂无</p>}
          </ol>
        </div>
      </div>
    </section>
  );
}
