// 班组进尺记录（与上报班组永久绑定）＋ 停挖 → 措施 → 交接 → 复挖链。
// 刷新后各条记录与交接关系整体恢复。
import { progressOfUnit } from "../domain/selectors";
import { useArchive } from "../state/store";
import { Badge } from "./common";

function ProgressRecords() {
  const s = useArchive();
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>班组记录绑定</p>
          <h2>每日进尺与发现记录</h2>
        </div>
      </div>
      <div className="progress-units">
        {s.units.map((u) => {
          const records = progressOfUnit(s, u.id);
          return (
            <div key={u.id} className="progress-group">
              <h3>
                {u.code}
                {u.status === "halted" ? <Badge tone="danger">保护停挖</Badge> : <Badge tone="ok">发掘中</Badge>}
              </h3>
              {records.length === 0 && <p className="muted-text">暂无进尺记录</p>}
              {records.map((p) => {
                const layer = s.strata.find((l) => l.id === p.layerId);
                const crew = s.crews.find((c) => c.id === p.crewId);
                const feature = s.features.find((f) => f.progressId === p.id);
                return (
                  <article key={p.id} className="progress-card">
                    <div className="progress-main">
                      <strong>{p.date}</strong>
                      <span>{layer?.code ?? "层位缺失"}</span>
                      <span className="depth-chip">{p.startDepth}–{p.startDepth + p.advance} cm（进尺 {p.advance}）</span>
                    </div>
                    <div className="progress-meta">
                      <span>上报班组：<b>{crew?.name}</b>（永久绑定）</span>
                      <span>现场负责人：{p.supervisor}</span>
                      {feature && (
                        <span className="feature-bind">
                          <Badge tone="warn">发现 {feature.code} {feature.type}</Badge>
                          发现记录绑定 {crew?.name}
                        </span>
                      )}
                    </div>
                    {p.crossLayer && p.crossLayer.length > 0 && (
                      <ul className="sup-list">
                        {p.crossLayer.map((sp) => (
                          <li key={sp.layerCode}>跨层补记：{sp.layerCode}（{sp.fromDepth}–{sp.toDepth} cm）{sp.note}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Timeline() {
  const s = useArchive();
  const events: Array<{ ts: string; node: React.ReactNode }> = [];

  for (const h of s.halts) {
    const feature = s.features.find((f) => f.id === h.featureId);
    const unit = s.units.find((u) => u.id === h.unitId);
    events.push({
      ts: h.startedAt,
      node: (
        <div className="timeline-event halt">
          <Badge tone="danger">停挖</Badge>
          <span>{unit?.code} 因 {feature?.code} {feature?.type} 转入保护停挖</span>
          <span className="muted-text">{h.reason}</span>
        </div>
      ),
    });
  }
  for (const m of s.measures) {
    const feature = s.features.find((f) => f.id === m.featureId);
    events.push({
      ts: m.createdAt,
      node: (
        <div className="timeline-event measure">
          <Badge tone="warn">保护措施</Badge>
          <span>{feature?.code}：{m.content}</span>
          <span className="muted-text">覆盖 {m.unitIds.map((id) => s.units.find((u) => u.id === id)?.code).join("、")} · 登记人 {m.operator}</span>
        </div>
      ),
    });
  }
  for (const hd of s.handovers) {
    const unit = s.units.find((u) => u.id === hd.unitId);
    const from = s.crews.find((c) => c.id === hd.fromCrewId);
    const to = s.crews.find((c) => c.id === hd.toCrewId);
    events.push({
      ts: hd.createdAt,
      node: (
        <div className="timeline-event handover">
          <Badge tone="muted">班组交接</Badge>
          <span>{unit?.code}：{from?.name} → {to?.name}</span>
          <span className="muted-text">未完坐标 {hd.unfinishedCoordinates.length} 处：{hd.unfinishedCoordinates.join("；")}</span>
          <span className="muted-text">出土物暂存点：{hd.stagingPoint} · 交接负责人 {hd.supervisor}</span>
          <span className="muted-text">原班组进尺与发现记录仍绑定 {from?.name}</span>
        </div>
      ),
    });
  }
  for (const r of s.resumes) {
    const unit = s.units.find((u) => u.id === r.unitId);
    const crew = s.crews.find((c) => c.id === r.crewId);
    events.push({
      ts: r.createdAt,
      node: (
        <div className="timeline-event resume">
          <Badge tone="ok">复挖</Badge>
          <span>{unit?.code} 由 {crew?.name} 复挖{r.handoverId ? "（经班组交接）" : "（原班组）"}</span>
        </div>
      ),
    });
  }

  events.sort((a, b) => a.ts.localeCompare(b.ts));

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>闭环时序</p>
          <h2>停挖 · 措施 · 交接 · 复挖</h2>
        </div>
      </div>
      <ol className="timeline">
        {events.map((e, i) => (
          <li key={i} className="timeline-item">
            <time>{e.ts.slice(0, 10)} {e.ts.slice(11, 16)}</time>
            {e.node}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function RecordsPanel() {
  return (
    <div className="records-grid">
      <ProgressRecords />
      <Timeline />
    </div>
  );
}
