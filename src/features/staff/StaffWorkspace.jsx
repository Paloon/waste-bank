import React from "react";
import {
  Home,
  ClipboardCheck,
  Gift,
  Users,
  Package,
  Coins,
  GraduationCap,
  History,
  TrendingUp,
  LogOut,
  Plus,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { Badge, Empty, Field, Photo, RewardArt } from "../../components.jsx";
import OperationsStatus from "../../OperationsStatus.jsx";
import Reports from "../../Reports.jsx";
import ActionButton from "../../components/ActionButton.jsx";
import { recyclingRates } from "../../../shared/recycling.js";
import { policy } from "../../../shared/policy.js";
const fmt = (value) => Number(value || 0).toLocaleString("th-TH");
const date = (value) =>
  new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const adminNav = [
  ["dashboard", Home, "ภาพรวม"],
  ["reports", TrendingUp, "รายงานตามช่วงเวลา"],
  ["reviews", ClipboardCheck, "ตรวจขยะ"],
  ["pickups", Gift, "ส่งมอบรางวัล"],
  ["students", Users, "นักเรียน"],
  ["rewards", Package, "จัดการรางวัล"],
  ["ledger", Coins, "บัญชี Coins"],
  ["promotion", GraduationCap, "เลื่อนชั้น"],
  ["audit", History, "ประวัติเจ้าหน้าที่"],
];

/** Controlled staff view; data requests and mutations remain with the application. */
export default function StaffWorkspace({ view, actions }) {
  const { admin, publicData: data, staff } = view.data;
  const {
    tab: adminTab,
    page: adminPage,
    query,
    auditCategory: category,
    reportRefresh,
  } = view.navigation;
  const { busy, loading: adminLoading, failed: adminFailed } = view.status;
  const { ids: selectedStudents, rows: visibleStudents } = view.selection;
  const { year, rows: promotion } = view.promotion;
  const {
    onNavigateTab,
    onRefresh,
    onMaintenance,
    onStudentHistory,
    onLogout: home,
    onTabChange: setAdminTab,
    onSearch: setQuery,
    onModal: openModal,
    onImage: setImage,
    onRewardImage: openRewardImage,
    onToggleVisibleStudents: toggleVisibleStudents,
    onToggleStudent: toggleStudent,
    onAuditCategoryChange: setCategory,
    onPromotionRowsChange: setPromotion,
    onPageChange: setAdminPage,
  } = actions;
  const studentName = (id) =>
    admin.students.find((student) => student.id === id);
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <span className="eyebrow">STAFF WORKSPACE</span>
        <h2>{staff}</h2>
        {adminNav.map(([key, Icon, label]) => (
          <button
            key={key}
            className={adminTab === key ? "active" : ""}
            onClick={() => onNavigateTab(key)}
          >
            <Icon size={20} />
            {label}
            {key === "reviews" && (
              <span className="count">{admin.stats?.pending || 0}</span>
            )}
          </button>
        ))}
        <button className="logout" onClick={home}>
          <LogOut size={18} /> ออกจากระบบ
        </button>
      </aside>
      <section className="admin-content">
        <div className="page-heading">
          <h1>{adminNav.find((x) => x[0] === adminTab)?.[2]}</h1>
          <button className="btn secondary" onClick={onRefresh}>
            รีเฟรช
          </button>
        </div>
        {adminLoading && <p role="status">กำลังโหลดข้อมูล…</p>}
        {adminFailed && (
          <p role="alert" className="danger">
            โหลดข้อมูลไม่สำเร็จ กรุณากดรีเฟรช
          </p>
        )}
        {adminTab === "reports" && <Reports refreshKey={reportRefresh} />}
        <OperationsStatus health={admin.health} />
        {adminTab === "dashboard" && (
          <>
            <h2 className="staff-task-heading">งานที่ต้องทำ</h2>
            <div className="dashboard-stats">
              {[
                [
                  "รอตรวจขยะ",
                  admin.stats?.pending || 0,
                  ClipboardCheck,
                  "reviews",
                ],
                ["รอรับรางวัล", admin.stats?.pickups || 0, Gift, "pickups"],
                [
                  "นักเรียน Active",
                  admin.stats?.students || 0,
                  Users,
                  "students",
                ],
                [
                  "ของใกล้หมด",
                  admin.rewards.filter((r) => r.stock <= 3).length,
                  Package,
                  "rewards",
                ],
              ].map(([label, value, Icon, target]) => (
                <button
                  className="stat-card"
                  key={label}
                  onClick={() => setAdminTab(target)}
                >
                  <Icon />
                  <strong>{value}</strong>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="panel">
              <div className="section-heading">
                <h2>วันนี้ทำสิ่งดีไปเท่าไหร่?</h2>
                <TrendingUp />
              </div>
              <div className="today-stats">
                <div>
                  <strong>{admin.stats?.approvedToday || 0}</strong>
                  <p>รายการที่อนุมัติวันนี้</p>
                </div>
                <div>
                  <strong>{fmt(admin.stats?.coinsToday || 0)}</strong>
                  <p>Coins ที่มอบวันนี้</p>
                </div>
              </div>
              <h3>สัดส่วนขยะที่ผ่านการตรวจ</h3>
              {data.categories.map((c) => {
                const count = admin.stats?.categories?.[c] || 0;
                return (
                  <div className="bar-row" key={c}>
                    <span>{c}</span>
                    <div>
                      <i
                        style={{
                          width:
                            Math.max(
                              0,
                              (count /
                                Math.max(1, admin.stats?.submissions || 0)) *
                                100,
                            ) + "%",
                        }}
                      />
                    </div>
                    <b>{count}</b>
                  </div>
                );
              })}
            </div>
            <div className="panel">
              <h2>กิจกรรมล่าสุด</h2>
              {admin.audit.slice(0, 5).map((a) => (
                <div className="ledger-row" key={a.id}>
                  <History />
                  <div className="grow">
                    <b>
                      {a.action} · {a.staff}
                    </b>
                    <small>
                      {a.target} · {date(a.at)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
            <details className="staff-system-details">
              <summary>รายละเอียดระบบและการสำรองข้อมูล</summary>
              <div className="panel">
                <h3>Google Drive</h3>
                <p>
                  {admin.drive?.connected
                    ? "เชื่อมแล้ว — รูปใหม่เก็บใน Drive"
                    : admin.drive?.configured
                      ? "ตั้งค่า OAuth แล้ว แต่ยังไม่ได้เชื่อมบัญชี"
                      : "ยังไม่ตั้งค่า OAuth ใน .env — รูปยังเก็บใน SQLite"}
                </p>
                {admin.drive?.configured && !admin.drive?.connected && (
                  <a className="btn secondary" href="/api/drive/connect">
                    เชื่อมบัญชี Google Drive
                  </a>
                )}
              </div>
              <div className="panel">
                <h3>สถานะดูแลระบบ</h3>
                {admin.databaseBytes && (
                  <p>
                    ฐานข้อมูล:{" "}
                    {fmt(Math.ceil(admin.databaseBytes / 1024 / 1024))} MiB{" "}
                    {admin.databaseBytes > 400 * 1024 * 1024 && (
                      <strong className="danger">ใกล้ขีดจำกัด Free Plan</strong>
                    )}
                  </p>
                )}
                {admin.health?.maintenance?.storage && (
                  <p>
                    พื้นที่บัญชี Drive ใช้แล้ว{" "}
                    {fmt(
                      Math.ceil(
                        Number(admin.health.maintenance.storage.usage) /
                          1024 /
                          1024,
                      ),
                    )}{" "}
                    MiB{" "}
                    {admin.health.maintenance.storage.limit &&
                      Number(admin.health.maintenance.storage.usage) >
                        Number(admin.health.maintenance.storage.limit) *
                          0.8 && (
                        <strong className="danger">พื้นที่เหลือน้อย</strong>
                      )}
                  </p>
                )}
                {admin.health?.maintenance?.reconciliation?.ok === false && (
                  <p className="danger">
                    พบยอดบัญชีหรือรายการที่ไม่สอดคล้องกัน กรุณาให้ผู้ดูแลตรวจสอบ
                  </p>
                )}
                <p>
                  ล้างรูปครั้งล่าสุด:{" "}
                  {admin.health?.maintenance?.at
                    ? date(admin.health.maintenance.at)
                    : "ยังไม่มีผลการทำงาน"}
                </p>
                <p>
                  งานรูปค้างเกิน 1 วัน:{" "}
                  {admin.health?.maintenance?.overdue || 0} · ผิดพลาด:{" "}
                  {admin.health?.maintenance?.failures || 0}
                </p>
                <p>
                  สำรองข้อมูลครั้งล่าสุด:{" "}
                  {admin.health?.backup?.at
                    ? date(admin.health.backup.at)
                    : "ยังไม่มีหลักฐานการสำรองข้อมูล"}
                </p>
                {admin.health?.error && (
                  <p className="danger">
                    เหตุขัดข้องล่าสุด: {admin.health.error.code} ·{" "}
                    {date(admin.health.error.at)}
                    {admin.health.error.eventId && (
                      <small>รหัสเหตุการณ์: {admin.health.error.eventId}</small>
                    )}
                  </p>
                )}
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={onMaintenance}
                >
                  ตรวจและล้างรูปที่ค้าง
                </button>
              </div>
            </details>
          </>
        )}
        {adminTab === "reviews" && (
          <>
            <p className="muted">
              ตรวจภาพ แก้ประเภทและจำนวนให้ตรงกับขยะจริง ระบบคำนวณ Coins
              ก่อนอนุมัติ
            </p>
            <div className="review-grid">
              {admin.submissions
                .filter((s) => s.status === "Pending")
                .map((s) => {
                  const p = studentName(s.student);
                  return (
                    <article className="panel review-card" key={s.id}>
                      <div className="evidence-pair">
                        <Photo src={s.image} onClick={setImage} />
                        {s.disposalImage && (
                          <Photo src={s.disposalImage} onClick={setImage} />
                        )}
                      </div>
                      <Badge status={s.status} />
                      <h3>{s.category}</h3>
                      <p>
                        {s.submittedCount
                          ? `นักเรียนแจ้ง ${s.submittedCount} ${(data.recyclingRates || recyclingRates)[s.submittedCategory || s.category].unit}`
                          : "รายการเก่า: ครูกรอกจำนวนจากภาพก่อนอนุมัติ"}
                      </p>
                      <b>{p?.name}</b>
                      <p>
                        {s.student} · ม.{p?.grade}/{p?.room}
                      </p>
                      <small>{date(s.at)}</small>
                      <p>{s.note || "ไม่มีหมายเหตุ"}</p>
                      <div className="button-row">
                        <button
                          className="btn primary"
                          onClick={() =>
                            openModal({
                              type: "review",
                              item: s,
                              status: "Approved",
                            })
                          }
                        >
                          อนุมัติ
                        </button>
                        <button
                          className="btn secondary danger"
                          onClick={() =>
                            openModal({
                              type: "review",
                              item: s,
                              status: "Rejected",
                            })
                          }
                        >
                          ไม่อนุมัติ
                        </button>
                      </div>
                    </article>
                  );
                })}
            </div>
            {!admin.submissions.some((s) => s.status === "Pending") && (
              <Empty text="ตรวจครบแล้ว ขอบคุณที่ช่วยดูแลโลก!" />
            )}
          </>
        )}
        {adminTab === "pickups" && (
          <>
            <input
              className="search-input"
              aria-label="ค้นหาการรับรางวัล"
              placeholder="ค้นหาชื่อ รหัสนักเรียน หรือรหัสรับรางวัล"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {admin.redemptions
              .filter(
                (r) =>
                  r.status === "Pending Pickup" &&
                  [r.code, r.student, studentName(r.student)?.name]
                    .join(" ")
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((r) => (
                <div className="panel pickup-row" key={r.id}>
                  <Gift size={32} />
                  <div className="grow">
                    <h3>
                      {r.name} · {r.cost} Coins
                    </h3>
                    <b>{studentName(r.student)?.name}</b>
                    <p>
                      {r.student} · ม.{studentName(r.student)?.grade}/
                      {studentName(r.student)?.room}
                    </p>
                    <code>{r.code}</code>
                    <small>{date(r.at)}</small>
                  </div>
                  <button
                    className="btn primary"
                    onClick={() => openModal({ type: "handover", item: r })}
                  >
                    ยืนยันส่งมอบ
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => openModal({ type: "cancelReward", item: r })}
                  >
                    ยกเลิกและคืน Coins
                  </button>
                </div>
              ))}
            {!admin.redemptions.some((r) => r.status === "Pending Pickup") && (
              <Empty />
            )}
          </>
        )}
        {adminTab === "students" && (
          <>
            <div className="student-tools">
              <input
                className="search-input"
                aria-label="ค้นหานักเรียน"
                placeholder="ค้นหาชื่อ รหัส ชั้น หรือห้อง"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className="btn secondary danger"
                disabled={!selectedStudents.length || busy}
                onClick={() =>
                  openModal({
                    type: "deleteStudents",
                    ids: selectedStudents.filter((id) =>
                      admin.students.some((s) => s.id === id),
                    ),
                  })
                }
              >
                <Trash2 size={17} /> ลบที่เลือก ({selectedStudents.length})
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="เลือกนักเรียนทั้งหมดที่แสดง"
                        checked={
                          visibleStudents.length > 0 &&
                          visibleStudents.every((s) =>
                            selectedStudents.includes(s.id),
                          )
                        }
                        onChange={toggleVisibleStudents}
                        disabled={!visibleStudents.length}
                      />
                    </th>
                    <th>นักเรียน</th>
                    <th>ชั้น / ห้อง</th>
                    <th>สถานะ</th>
                    <th>Coins</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStudents.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={"เลือก " + s.name}
                          checked={selectedStudents.includes(s.id)}
                          onChange={() => toggleStudent(s.id)}
                        />
                      </td>
                      <td>
                        <b>{s.name}</b>
                        <small>
                          เลขที่ {s.number || "—"} · {s.id}
                        </small>
                      </td>
                      <td>
                        ม.{s.grade}/{s.room}
                      </td>
                      <td>{s.status}</td>
                      <td>{fmt(s.balance)}</td>
                      <td>
                        <div className="button-row">
                          <button
                            className="text-button"
                            onClick={() => onStudentHistory(s)}
                          >
                            ดูประวัติ
                          </button>
                          <button
                            className="text-button"
                            onClick={() =>
                              openModal({
                                type: "profile",
                                p: s,
                                adminMode: true,
                              })
                            }
                          >
                            แก้ไข
                          </button>
                          <button
                            className="text-button"
                            onClick={() => openModal({ type: "adjust", p: s })}
                          >
                            ปรับ Coins
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {adminTab === "rewards" && (
          <>
            <button
              className="btn primary"
              onClick={() =>
                openModal({
                  type: "reward",
                  item: {
                    name: "",
                    description: "",
                    price: 100,
                    stock: 0,
                    enabled: true,
                    image: "",
                    images: [],
                  },
                })
              }
            >
              <Plus size={18} /> เพิ่มรางวัล
            </button>
            <div className="rewards-grid admin-rewards">
              {admin.rewards.map((r) => (
                <article className="reward-card" key={r.id}>
                  <RewardArt reward={r} onOpen={openRewardImage} />
                  <div className="reward-body">
                    <h3>{r.name}</h3>
                    <p>
                      {r.price} Coins · เหลือ {r.stock} ชิ้น
                    </p>
                    <p>
                      {r.enabled ? "เปิดให้แลก" : "ปิดให้แลก"}
                      {r.stock <= 3 ? " · สต็อกต่ำ" : ""}
                    </p>
                    <button
                      className="btn secondary"
                      onClick={() => openModal({ type: "reward", item: r })}
                    >
                      แก้ไขรางวัล
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        openModal({ type: "deleteReward", item: r })
                      }
                    >
                      <Trash2 size={17} /> ลบรางวัล
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {adminTab === "ledger" && (
          <>
            <input
              className="search-input"
              aria-label="ค้นหา Coins"
              placeholder="ค้นหารหัสนักเรียน เหตุผล หรือประเภท"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="panel">
              {admin.ledger
                .filter((t) =>
                  [t.student, t.reason, t.type].join(" ").includes(query),
                )
                .map((t) => (
                  <div className="ledger-row" key={t.id}>
                    <Coins />
                    <div className="grow">
                      <b>{t.reason}</b>
                      <small>
                        {studentName(t.student)?.name} · {t.student} ·{" "}
                        {date(t.at)}
                      </small>
                      <small>
                        {t.type} · {t.staff || "นักเรียน"}
                        {t.related ? " · อ้างอิง " + t.related.slice(0, 8) : ""}
                      </small>
                    </div>
                    <strong className={t.amount < 0 ? "danger" : "positive"}>
                      {t.amount > 0 ? "+" : ""}
                      {fmt(t.amount)}
                    </strong>
                  </div>
                ))}
            </div>
          </>
        )}
        {adminTab === "audit" && (
          <>
            <div className="filters">
              <input
                className="search-input"
                aria-label="ค้นหา Audit"
                placeholder="ค้นหาเจ้าหน้าที่ รายการ หรือเหตุผล"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select
                aria-label="ประเภท Audit"
                value={category.startsWith("audit:") ? category.slice(6) : ""}
                onChange={(e) => setCategory("audit:" + e.target.value)}
              >
                <option value="">ทุกการกระทำ</option>
                {[...new Set(admin.audit.map((a) => a.action))].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="panel">
              {admin.audit
                .filter(
                  (a) =>
                    JSON.stringify(a).includes(query) &&
                    (!category.startsWith("audit:") ||
                      !category.slice(6) ||
                      a.action === category.slice(6)),
                )
                .map((a) => (
                  <div className="audit-row" key={a.id}>
                    <div>
                      <b>{a.action}</b>
                      <span>
                        {a.staff}
                        {a.actorId && a.actorId !== a.staff
                          ? ` (${a.actorId})`
                          : ""}{" "}
                        · {date(a.at)}
                      </span>
                    </div>
                    <p>
                      {a.target}
                      {a.reason ? " · " + a.reason : ""}
                    </p>
                    <div className="audit-values">
                      <code>{JSON.stringify(a.before)}</code>
                      <ArrowRight size={16} />
                      <code>{JSON.stringify(a.after)}</code>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
        {adminTab === "promotion" && (
          <>
            <div className="panel">
              <h2>ตรวจสอบก่อนขึ้นปีการศึกษาใหม่</h2>
              <p>
                ปรับชั้น ห้อง และสถานะรายคนได้ Coins และประวัติทั้งหมดจะคงอยู่
              </p>
              <Field label="ปีการศึกษา (ค.ศ.)">
                <input type="number" readOnly value={year} />
              </Field>
              <div className="promotion-summary">
                {[1, 2, 3, 4, 5, 6].map((g) => (
                  <span key={g}>
                    ม.{g} → {g === 6 ? "ศิษย์เก่า" : "ม." + (g + 1)}
                    <b>
                      {promotion.filter((p) => p.oldGrade === String(g)).length}{" "}
                      คน
                    </b>
                  </span>
                ))}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>นักเรียน</th>
                      <th>ชั้นเดิม</th>
                      <th>ชั้นใหม่</th>
                      <th>ห้อง</th>
                      <th>เลขที่</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotion.map((p, i) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>ม.{p.oldGrade}</td>
                        <td>
                          <select
                            aria-label={"ชั้นใหม่ " + p.name}
                            value={p.grade}
                            onChange={(e) =>
                              setPromotion((old) =>
                                old.map((s, j) =>
                                  j === i ? { ...s, grade: e.target.value } : s,
                                ),
                              )
                            }
                          >
                            {[1, 2, 3, 4, 5, 6].map((n) => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            aria-label={"ห้อง " + p.name}
                            type="number"
                            min="1"
                            max="30"
                            value={p.room}
                            onChange={(e) =>
                              setPromotion((old) =>
                                old.map((s, j) =>
                                  j === i ? { ...s, room: e.target.value } : s,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label={"เลขที่ใหม่ " + p.name}
                            type="number"
                            min="1"
                            max={policy.maxNumber}
                            value={p.number}
                            onChange={(e) =>
                              setPromotion((old) =>
                                old.map((s, j) =>
                                  j === i
                                    ? { ...s, number: e.target.value }
                                    : s,
                                ),
                              )
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={"สถานะ " + p.name}
                            value={p.status}
                            onChange={(e) =>
                              setPromotion((old) =>
                                old.map((s, j) =>
                                  j === i
                                    ? { ...s, status: e.target.value }
                                    : s,
                                ),
                              )
                            }
                          >
                            {[
                              "Active",
                              "Alumni",
                              "Transferred",
                              "Inactive",
                            ].map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ActionButton
                busy={busy}
                onClick={() => openModal({ type: "promote" })}
                disabled={!promotion.length || busy}
              >
                ตรวจสอบครบแล้ว · เลื่อนชั้น {promotion.length} คน
              </ActionButton>
            </div>
          </>
        )}
        {["students", "reviews", "pickups", "ledger", "audit"].includes(
          adminTab,
        ) && (
          <div className="pagination">
            <button
              className="btn secondary"
              disabled={adminPage === 0 || busy}
              onClick={() => setAdminPage((p) => p - 1)}
            >
              หน้าก่อน
            </button>
            <span>หน้า {adminPage + 1}</span>
            <button
              className="btn secondary"
              disabled={!admin.hasMore || busy}
              onClick={() => setAdminPage((p) => p + 1)}
            >
              หน้าถัดไป
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
