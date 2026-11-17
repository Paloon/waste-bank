// Leaderboard page. Loaded on demand; state stays in App so filters and
// search results survive switching pages.
import React from "react";
import { Coins, Search, Trophy } from "lucide-react";
import { Empty } from "../../components.jsx";
import { policy } from "../../../shared/policy.js";

const fmt = (n) => Number(n || 0).toLocaleString("th-TH");

export default function LeaderboardPage({
  period,
  setPeriod,
  grade,
  setGrade,
  room,
  setRoom,
  ranked,
  ranks,
  setRanks,
  leaderboard,
  query,
  setQuery,
  onSearch,
}) {
  return (
    <>
      <div className="leader-intro">
        <span className="hero-tag">
          <Trophy size={17} /> EVERY LITTLE ACTION COUNTS
        </span>
        <h2>เก่งมากเลย เหล่าฮีโร่รักษ์โลก!</h2>
        <p>อันดับจาก Coins ที่สะสมได้ · ใช้ Coins แลกรางวัลแล้วอันดับไม่ลด</p>
      </div>
      <div className="filters">
        <div className="tabs compact">
          {[
            ["overall", "ทั้งหมด"],
            ["month", "เดือนนี้"],
          ].map(([t, label]) => (
            <button
              className={period === t ? "active" : ""}
              key={t}
              onClick={() => {
                setPeriod(t);
                setRanks(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="กรองระดับชั้น"
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value);
            setRanks(null);
          }}
        >
          <option value="">ทุกระดับชั้น</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              ม.{n}
            </option>
          ))}
        </select>
        <select
          aria-label="กรองห้อง"
          value={room}
          onChange={(e) => {
            setRoom(e.target.value);
            setRanks(null);
          }}
        >
          <option value="">ทุกห้อง</option>
          {Array.from({ length: policy.maxRoom }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              ห้อง {n}
            </option>
          ))}
        </select>
      </div>
      <div className="panel rank-search">
        <form
          className="search-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSearch();
          }}
        >
          <Search />
          <input
            aria-label="ค้นหาอันดับ"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาด้วยชื่อหรือรหัสนักเรียน"
            required
          />
          <button className="btn primary">ค้นหา</button>
        </form>
        {ranks &&
          (!ranks.length ? (
            <Empty text="ไม่พบชื่อในเงื่อนไขนี้" />
          ) : (
            ranks.map((p) => (
              <div className="leader-row" key={p.rank}>
                <b>#{p.rank}</b>
                <span className="grow">
                  {p.name} · ม.{p.grade}/{p.room}
                </span>
                <strong>{fmt(p.earned)} Coins</strong>
              </div>
            ))
          ))}
      </div>
      <div className="podium">
        {ranked.slice(0, 3).map((p, i) => (
          <div className={"podium-card podium-" + i} key={p.name}>
            <span className="medal">{["🥇", "🥈", "🥉"][i]}</span>
            <div className="avatar large">{p.name[0]}</div>
            <h3>{p.name}</h3>
            <p>
              ม.{p.grade}/{p.room}
            </p>
            <strong>
              {fmt(period === "month" ? p.monthly : p.earned)}{" "}
              <Coins size={20} />
            </strong>
          </div>
        ))}
      </div>
      <div className="panel">
        {leaderboard.loading && <p role="status">กำลังโหลดอันดับ…</p>}
        {leaderboard.error && (
          <p role="alert" className="danger">
            {leaderboard.error}
          </p>
        )}
        <div className="section-heading">
          <h2>10 อันดับรักษ์โลก</h2>
          <span>
            {period === "month"
              ? "เฉพาะเดือนนี้ ไม่รีเซ็ตยอด Coins"
              : "ยอดสะสมตลอดกิจกรรม"}
          </span>
        </div>
        {ranked.slice(0, 10).map((p, i) => (
          <div className="leader-row" key={p.name}>
            <b className="rank-number">{i + 1}</b>
            <span className="avatar">{p.name[0]}</span>
            <b className="grow">{p.name}</b>
            <span>
              ม.{p.grade}/{p.room}
            </span>
            <strong>
              {fmt(period === "month" ? p.monthly : p.earned)}{" "}
              <Coins size={17} />
            </strong>
          </div>
        ))}
        {!ranked.length && <Empty />}
      </div>
    </>
  );
}
