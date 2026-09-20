// 侧栏：探方状态总览（刷新后与档案保持一致）
import { activeHaltOfUnit, featureById, lastCrewOfUnit } from "../domain/selectors";
import type { AppState } from "../domain/types";
import { useArchive } from "../state/store";
import { Badge, Panel } from "./common";

function UnitRow({ s, unitId }: { s: AppState; unitId: string }) {
  const unit = s.units.find((u) => u.id === unitId)!;
  const halt = activeHaltOfUnit(s, unit.id);
  const feature = halt ? featureById(s, halt.featureId) : undefined;
  const lastCrew = lastCrewOfUnit(s, unit.id);
  const crew = s.crews.find((c) => c.id === lastCrew);

  return (
    <article className={`unit-row ${unit.status === "halted" ? "is-halted" : ""}`}>
      <div className="unit-row-head">
        <strong>{unit.code}</strong>
        {unit.status === "halted" ? (
          <Badge tone="danger">保护停挖</Badge>
        ) : (
          <Badge tone="ok">发掘中</Badge>
        )}
      </div>
      {feature && <p className="unit-row-meta">停挖原因：{feature.code} {feature.type}</p>}
      {crew && <p className="unit-row-meta">最近班组：{crew.name}</p>}
    </article>
  );
}

export function UnitSidebar() {
  const s = useArchive();
  return (
    <Panel title="探方总览" eyebrow="领域数据">
      <div className="unit-list">
        {s.units.map((u) => (
          <UnitRow key={u.id} s={s} unitId={u.id} />
        ))}
      </div>
      <div className="sidebar-legend">
        <p>班组</p>
        <div className="chips">
          {s.crews.map((c) => (
            <span key={c.id}>{c.name}</span>
          ))}
        </div>
        <p>遗迹类型</p>
        <div className="chips muted">
          {["灰坑", "墓葬", "房址", "沟状遗迹"].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
