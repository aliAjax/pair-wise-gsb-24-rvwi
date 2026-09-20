// 冲突展示：任何校验冲突都必须能定位到 探方 / 地层 / 深度 / 班组 / 原值。
import { getState } from "../state/store";
import type { Conflict } from "../rules/validators";

function Ctx({ conflict }: { conflict: Conflict }) {
  const s = getState();
  const ctx = conflict.context ?? {};
  const unit = ctx.unitId ? s.units.find((u) => u.id === ctx.unitId) : undefined;
  const stratum = ctx.stratumId ? s.strata.find((l) => l.id === ctx.stratumId) : undefined;
  const crew = ctx.crewId ? s.crews.find((c) => c.id === ctx.crewId) : undefined;

  const rows: Array<[string, string]> = [];
  if (unit) rows.push(["探方", unit.code]);
  if (stratum) rows.push(["地层", stratum.code]);
  if (ctx.depth) rows.push(["深度", ctx.depth]);
  if (crew) rows.push(["班组", crew.name]);
  if (ctx.oldValue) rows.push(["原值", ctx.oldValue]);

  if (rows.length === 0) return null;
  return (
    <dl className="conflict-ctx">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ConflictView({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="conflict-box" role="alert">
      {conflicts.map((c, i) => (
        <div key={`${c.code}-${i}`} className="conflict-item">
          <p className="conflict-msg">⛔ {c.message}</p>
          <Ctx conflict={c} />
        </div>
      ))}
    </div>
  );
}
