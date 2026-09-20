import type { AppState, Feature, ProgressReport, Stratum } from "../domain/types";
import {
  blockingFeatures,
  crewName,
  trenchFeatures,
  trenchReports,
  trenchStrata,
} from "../domain/rules";

function depthLabel(r: ProgressReport): string {
  return `${r.startDepth}–${r.endDepth}cm`;
}

function stratumCode(state: AppState, id: string): string {
  return state.strata.find((s) => s.id === id)?.code ?? id;
}

function FeatureTag({ feature, state }: { feature: Feature; state: AppState }) {
  return (
    <div className={`feature-tag ${feature.protectionRegistered ? "protected" : "open"}`}>
      <strong>
        {feature.code} · {feature.kind}
      </strong>
      <span>
        {feature.depth}cm · {crewName(state, feature.crewId)}发现于 {feature.date}
      </span>
      <em>{feature.protectionRegistered ? `保护措施已登记（${feature.protectedAt}）` : "保护措施未登记"}</em>
    </div>
  );
}

export function TrenchBoard({ state }: { state: AppState }) {
  return (
    <section className="panel trench-board">
      <div className="section-heading">
        <div>
          <p>探方总览</p>
          <h2>探方 · 地层 · 进尺 · 遗迹</h2>
        </div>
      </div>
      <div className="trench-grid">
        {state.trenches.map((trench) => {
          const strata = trenchStrata(state, trench.id);
          const reports = trenchReports(state, trench.id);
          const features = trenchFeatures(state, trench.id);
          const blockers = blockingFeatures(state, trench.id);
          const halted = trench.status === "halted";
          const lastEnd = reports.length ? reports[reports.length - 1].endDepth : 0;
          return (
            <article key={trench.id} className={`trench-card ${halted ? "is-halted" : ""}`}>
              <header>
                <div>
                  <h3>{trench.id}</h3>
                  <span className="crew-line">
                    当前班组：<b>{crewName(state, trench.currentCrewId)}</b>
                    {halted && trench.haltedFromCrewId && trench.haltedFromCrewId !== trench.currentCrewId && (
                      <>（停挖时原班组：{crewName(state, trench.haltedFromCrewId)}）</>
                    )}
                  </span>
                </div>
                <span className={`badge ${halted ? "badge-danger" : "badge-ok"}`}>
                  {halted ? "保护停挖" : "发掘中"}
                </span>
              </header>

              <div className="trench-block">
                <p className="block-title">地层（cm）</p>
                <ul className="stratum-list">
                  {strata.map((s: Stratum) => (
                    <li key={s.id} className={s.accepted ? "accepted" : ""}>
                      <b>{s.code}</b>
                      <span>
                        {s.topDepth}–{s.bottomDepth}
                      </span>
                      <span className="soil">{s.soil}</span>
                      <i className={s.accepted ? "lock locked" : "lock"} title={s.accepted ? "已验收·只读" : "未验收"}>
                        {s.accepted ? "🔒验收" : "待验收"}
                      </i>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="trench-block">
                <p className="block-title">
                  进尺（已挖至 {lastDepth(reports)}）
                </p>
                <ol className="progress-list">
                  {reports.map((r) => (
                    <li key={r.id}>
                      <span className="range">{depthLabel(r)}</span>
                      <span className="meta">
                        {r.date} · {stratumCode(state, r.stratumId)}
                        {r.crossedStrata ? ` · 跨层补记：${r.crossedStrata}` : ""} · {r.supervisor} ·{" "}
                        {crewName(state, r.crewId)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="trench-block">
                <p className="block-title">遗迹单位</p>
                {features.length === 0 ? (
                  <p className="empty-line">暂无发现</p>
                ) : (
                  <div className="feature-tags">
                    {features.map((f) => (
                      <FeatureTag key={f.id} feature={f} state={state} />
                    ))}
                  </div>
                )}
                {halted && blockers.length > 0 && (
                  <p className="block-warn">禁止复挖：{blockers.map((f) => f.code).join("、")} 保护措施未登记</p>
                )}
              </div>

              {(() => {
                const handovers = state.handovers.filter((h) => h.trenchId === trench.id);
                if (handovers.length === 0) return null;
                return (
                  <div className="trench-block">
                    <p className="block-title">交接记录</p>
                    {handovers.map((h) => (
                      <div key={h.id} className="handover-mini">
                        <b>
                          {h.date} · {crewName(state, h.fromCrewId)} → {crewName(state, h.toCrewId)}
                        </b>
                        <span>未完坐标：{h.pendingCoordinates}</span>
                        <span>暂存点：{h.artifactStaging}</span>
                        {h.note && <span>备注：{h.note}</span>}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function lastDepth(reports: ProgressReport[]): string {
  return reports.length ? `${reports[reports.length - 1].endDepth}cm` : "0cm";
}
