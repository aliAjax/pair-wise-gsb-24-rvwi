// 领域规则冒烟测试：node --version 需支持 ESM；由 esbuild 临时打包后运行
import { strict as assert } from "node:assert";
import { seedState } from "../src/domain/seed.ts";
import {
  acceptStratum,
  addCorrection,
  addFeature,
  addHandover,
  addProgress,
  blockingFeatures,
  integrityChecks,
  registerProtection,
  resumeTrench,
} from "../src/domain/rules.ts";

let s = seedState;
const failures: string[] = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log("PASS", name);
  } catch (err) {
    failures.push(name);
    console.error("FAIL", name, (err as Error).message);
  }
}

// 1. 正常进尺
check("正常进尺可上报", () => {
  const r = addProgress(s, {
    date: "2026-09-20", trenchId: "T0203", stratumId: "s-0203-3",
    startDepth: 100, advance: 20, crossedStrata: "", supervisor: "张工", crewId: "c1",
  });
  assert.ok(r.ok);
  if (r.ok) s = r.state;
});

// 2. 重叠进尺被拒
check("重叠进尺被拒且冲突信息含原值/深度/班组", () => {
  const r = addProgress(s, {
    date: "2026-09-20", trenchId: "T0203", stratumId: "s-0203-3",
    startDepth: 110, advance: 20, crossedStrata: "", supervisor: "张工", crewId: "c1",
  });
  assert.ok(!r.ok);
  if (!r.ok) {
    assert.ok(r.issues[0].message.includes("重叠"));
    assert.equal(r.issues[0].trenchId, "T0203");
    assert.ok(r.issues[0].depth!.includes("110"));
    assert.ok(r.issues[0].originalValue!.includes("c1") || r.issues[0].crewId === "c1");
  }
});

// 3. 首尾相接允许
check("首尾相接进尺允许", () => {
  const r = addProgress(s, {
    date: "2026-09-20", trenchId: "T0203", stratumId: "s-0203-3",
    startDepth: 120, advance: 5, crossedStrata: "", supervisor: "张工", crewId: "c1",
  });
  assert.ok(r.ok);
  if (r.ok) s = r.state;
});

// 4. 跨层不补记被拒；补记后通过
check("跨层必须补记层位", () => {
  // T0301 已挖到 90；90–100 仍为第3层，第3层底 120；造一个跨层区间 115–125 需第4层……
  // 现有 T0301 第3层 70–120，90–120 不跨层；改用大进尺 90–130：越过 120 但没有第4层地层 → 覆盖地层仍只有第3层。
  // 因此用 T0203：第3层 75–140，120–125 也不跨层。改为覆盖两层的场景：
  // T0301 第2层 28–70 已验收，已有进尺 0–90；构造与既有不重叠的跨层需在 90 以下，无第4层，无法跨层。
  // 新挖场景：另选 T0204（停挖中）不适用。直接用规则函数验证：T0301 从 60 挖会重叠，
  // 故改为验证 T0203 区间 70–80 同时覆盖第2层与第3层，但与既有 30–75、75–100 重叠。
  // —— 为纯粹验证跨层规则，临时造一个干净状态：
  let t: typeof seedState = {
    ...seedState,
    trenches: seedState.trenches.map((x) => (x.id === "T0204" ? { ...x, status: "digging" as const } : x)),
    reports: seedState.reports.filter((x) => x.trenchId !== "T0204"),
  };
  const bad = addProgress(t, {
    date: "2026-09-20", trenchId: "T0204", stratumId: "s-0204-1",
    startDepth: 30, advance: 15, crossedStrata: "", supervisor: "李工", crewId: "c2",
  });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.ok(bad.issues.some((i) => i.message.includes("跨层")));
  const good = addProgress(t, {
    date: "2026-09-20", trenchId: "T0204", stratumId: "s-0204-1",
    startDepth: 30, advance: 15, crossedStrata: "另穿第2层 35–45cm", supervisor: "李工", crewId: "c2",
  });
  assert.ok(good.ok);
});

// 5. 发现遗迹 → 停挖 → 无保护不能复挖 → 登记保护 → 复挖
check("遗迹停挖-保护-复挖闭环", () => {
  let t = seedState;
  const f = addFeature(t, {
    date: "2026-09-20", code: "H99", kind: "灰坑", trenchId: "T0203",
    depth: 105, description: "测试坑", crewId: "c1", reportId: null,
  });
  assert.ok(f.ok);
  if (f.ok) t = f.state;
  assert.equal(t.trenches.find((x) => x.id === "T0203")!.status, "halted");
  assert.ok(blockingFeatures(t, "T0203").some((x) => x.code === "H99"));

  const blocked = resumeTrench(t, "T0203", "2026-09-21");
  assert.ok(!blocked.ok);

  // 停挖期间进尺被拒
  const rep = addProgress(t, {
    date: "2026-09-20", trenchId: "T0203", stratumId: "s-0203-3",
    startDepth: 100, advance: 5, crossedStrata: "", supervisor: "张工", crewId: "c1",
  });
  assert.ok(!rep.ok);

  const noNote = registerProtection(t, t.features.find((x) => x.code === "H99")!.id, "", "2026-09-20");
  assert.ok(!noNote.ok);

  const prot = registerProtection(t, t.features.find((x) => x.code === "H99")!.id, "套箱遮盖", "2026-09-20");
  assert.ok(prot.ok);
  if (prot.ok) t = prot.state;

  const resumed = resumeTrench(t, "T0203", "2026-09-21");
  assert.ok(resumed.ok);
});

// 6. 换班组未交接不能复挖；交接（缺字段被拒）后可复挖；原记录仍绑原班组
check("换班组交接闭环且原记录绑定不变", () => {
  let t = seedState; // T0204 因 H12 停挖，c2 为原班组，保护未登记
  const prot = registerProtection(t, "f1", "遮盖回填", "2026-09-19");
  assert.ok(prot.ok);
  if (prot.ok) t = prot.state;

  // 模拟当班班组已变更但无交接
  t = {
    ...t,
    trenches: t.trenches.map((x) =>
      x.id === "T0204" ? { ...x, currentCrewId: "c1", haltedFromCrewId: "c2" } : x,
    ),
  };
  const noHandover = resumeTrench(t, "T0204", "2026-09-20");
  assert.ok(!noHandover.ok);

  const missingFields = addHandover(t, {
    trenchId: "T0204", date: "2026-09-19", fromCrewId: "c2", toCrewId: "c1",
    pendingCoordinates: "", artifactStaging: "", note: "",
  });
  assert.ok(!missingFields.ok);

  // 移交班组必须是当前当班班组（当前已被改成 c1，传 c2 应被拒）
  const wrongFrom = addHandover(t, {
    trenchId: "T0204", date: "2026-09-19", fromCrewId: "c2", toCrewId: "c3",
    pendingCoordinates: "无", artifactStaging: "无", note: "",
  });
  assert.ok(!wrongFrom.ok);

  // 注意：上一步 currentCrewId 已被改为 c1，按页面流程交接时 from=currentCrewId(c1)，
  // 但规则要求 from 等于当前当班班组。恢复为真实流程：currentCrewId 保持 c2 直到交接完成。
  t = {
    ...t,
    trenches: t.trenches.map((x) =>
      x.id === "T0204" ? { ...x, currentCrewId: "c2", haltedFromCrewId: "c2" } : x,
    ),
  };
  const ok = addHandover(t, {
    trenchId: "T0204", date: "2026-09-19", fromCrewId: "c2", toCrewId: "c1",
    pendingCoordinates: "H12 坑口东沿未测点 2 个",
    artifactStaging: "T0204 木箱 B-01", note: "",
  });
  assert.ok(ok.ok);
  if (ok.ok) t = ok.state;
  assert.equal(t.trenches.find((x) => x.id === "T0204")!.currentCrewId, "c1");
  // haltedFromCrewId 仍是 c2；复挖检查 from=c2→to=c1 的交接，存在
  const resumed = resumeTrench(t, "T0204", "2026-09-20");
  assert.ok(resumed.ok);

  // 原进尺与发现仍绑 c2
  assert.ok(t.reports.filter((r) => r.trenchId === "T0204").every((r) => r.crewId === "c2"));
  assert.equal(t.features.find((f) => f.id === "f1")!.crewId, "c2");
});

// 6b. 连续更换班组 c2→c1→c3，交接链可追溯才可复挖
check("连续换班组需完整交接链", () => {
  let t = seedState;
  const prot = registerProtection(t, "f1", "遮盖回填", "2026-09-19");
  assert.ok(prot.ok);
  if (prot.ok) t = prot.state;
  const h1 = addHandover(t, {
    trenchId: "T0204", date: "2026-09-19", fromCrewId: "c2", toCrewId: "c1",
    pendingCoordinates: "坑口未测点", artifactStaging: "木箱B-01", note: "",
  });
  assert.ok(h1.ok);
  if (h1.ok) t = h1.state;
  const h2 = addHandover(t, {
    trenchId: "T0204", date: "2026-09-20", fromCrewId: "c1", toCrewId: "c3",
    pendingCoordinates: "同上", artifactStaging: "木箱B-01", note: "",
  });
  assert.ok(h2.ok);
  if (h2.ok) t = h2.state;
  assert.equal(t.trenches.find((x) => x.id === "T0204")!.currentCrewId, "c3");
  const resumed = resumeTrench(t, "T0204", "2026-09-20");
  assert.ok(resumed.ok);
});

// 7. 验收只读 + 更正留痕
check("验收地层只读且更正保留原值与原因", () => {
  let t = seedState;
  const dup = acceptStratum(t, "s-0203-1");
  assert.ok(!dup.ok); // 已验收

  const acc = acceptStratum(t, "s-0203-3");
  assert.ok(acc.ok);
  if (acc.ok) t = acc.state;

  const noReason = addCorrection(t, {
    date: "2026-09-20", stratumId: "s-0203-1", field: "soil", newValue: "灰土", reason: "",
  });
  assert.ok(!noReason.ok);

  const same = addCorrection(t, {
    date: "2026-09-20", stratumId: "s-0203-1", field: "soil",
    newValue: "耕土，灰黄色", reason: "笔误复核",
  });
  assert.ok(!same.ok);

  const c = addCorrection(t, {
    date: "2026-09-20", stratumId: "s-0203-1", field: "soil",
    newValue: "灰黄土夹砂", reason: "复核土色卡修正",
  });
  assert.ok(c.ok);
  if (c.ok) {
    t = c.state;
    const rec = t.corrections.at(-1)!;
    assert.equal(rec.oldValue, "耕土，灰黄色");
    assert.equal(t.strata.find((x) => x.id === "s-0203-1")!.soil, "灰黄土夹砂");
  }

  // 未验收地层不能走更正
  const reject = addCorrection(t, {
    date: "2026-09-20", stratumId: "s-0204-2", field: "soil",
    newValue: "x", reason: "y",
  });
  assert.ok(!reject.ok);
});

// 8. 种子数据一致性自检全部通过
check("种子数据链路自检全绿", () => {
  const checks = integrityChecks(seedState);
  for (const c of checks) assert.ok(c.ok, `${c.label}: ${c.detail}`);
});

if (failures.length) {
  console.error(`\n${failures.length} 项失败`);
  process.exit(1);
}
console.log("\n全部通过");
