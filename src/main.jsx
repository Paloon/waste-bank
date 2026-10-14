import ReviewDialog from "./features/staff/ReviewDialog.jsx";
import {
  validateForm,
  handleInvalid,
  clearFieldError,
} from "./forms/validation.js";
import ProfileForm from "./components/ProfileForm.jsx";
import ActionButton from "./components/ActionButton.jsx";
import { compressImage } from "./images/compress.js";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Recycle,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Coins,
  Gift,
  Trophy,
  Leaf,
  ShieldCheck,
  Home,
  Camera,
  Upload,
  CheckCircle2,
  X,
  LogOut,
  Search,
  Clock,
  Users,
  Package,
  ClipboardCheck,
  Settings,
  BookOpen,
  History,
  TrendingUp,
  GraduationCap,
  Plus,
  Trash2,
  NotebookPen,
  Milk,
  ShoppingBag,
  PenTool,
  Award,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import "./style.css";
import SubmissionHistory from "./SubmissionHistory.jsx";
import StaffWorkspace from "./features/staff/StaffWorkspace.jsx";
import SubmitWaste from "./features/student/SubmitWaste.jsx";
import useKioskSession, {
  sessionRetryMessage,
} from "./hooks/useKioskSession.js";
import RecyclingGuide, { WasteIcon, categoryLabel } from "./RecyclingGuide.jsx";
import { api, invalidateRequests } from "./api.js";
import { useAdminData } from "./hooks/useAdminData.js";
import { useLeaderboard } from "./hooks/useLeaderboard.js";
import {
  recyclingRates,
  estimateCoins,
  maxRecyclingCount,
  validCount,
} from "../shared/recycling.js";
import { policy } from "../shared/policy.js";

const fmt = (n) => Number(n || 0).toLocaleString("th-TH");
const date = (s) =>
  new Date(s).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
import {
  Badge,
  RewardArt,
  Field,
  Empty,
  Photo,
  RewardImageEditor,
} from "./components.jsx";
function App() {
  const [page, setPage] = useState("home"),
    [data, setData] = useState(null),
    [student, setStudent] = useState(null),
    [staff, setStaff] = useState(null),
    [adminData, setAdmin] = useState(null),
    [tab, setTab] = useState("trash"),
    [adminTab, setAdminTab] = useState("dashboard");
  const [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [lookup, setLookup] = useState(null),
    [id, setId] = useState(""),
    [photo, setPhoto] = useState(""),
    [disposalPhoto, setDisposalPhoto] = useState(""),
    [category, setCategory] = useState("ขวดพลาสติก"),
    [count, setCount] = useState(""),
    [note, setNote] = useState(""),
    [success, setSuccess] = useState(null),
    [query, setQuery] = useState(""),
    [period, setPeriod] = useState("overall"),
    [grade, setGrade] = useState(""),
    [room, setRoom] = useState(""),
    [ranks, setRanks] = useState(null),
    [promotion, setPromotion] = useState([]),
    [year, setYear] = useState(new Date().getFullYear()),
    [image, setImage] = useState("");
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [reportRefresh, setReportRefresh] = useState(0);
  const [successUntil, setSuccessUntil] = useState(0),
    [successRemaining, setSuccessRemaining] = useState(0);
  const [adminPage, setAdminPage] = useState(0),
    [previewVersion, setPreviewVersion] = useState("");
  const inFlight = useRef(false),
    uiEpoch = useRef(0),
    runVersion = useRef(0),
    operationKey = useRef(null),
    modalRef = useRef(null),
    lastFocus = useRef(null),
    successTimer = useRef(null);
  const refresh = () => api("public").then(setData);
  useEffect(() => {
    refresh().catch((e) => {
      if (!e.cancelled) setError(e.message);
    });
  }, []);
  const clear = () => {
    uiEpoch.current++;
    runVersion.current++;
    inFlight.current = false;
    setBusy(false);
    invalidateRequests();
    setIdleRemaining(null);
    setAdminPage(0);
    setPage("home");
    setStudent(null);
    setStaff(null);
    setTab("trash");
    setAdmin(null);
    setLookup(null);
    setId("");
    setPhoto("");
    setDisposalPhoto("");
    setNote("");
    setCount("");
    setModal(null);
    setSuccess(null);
    setSuccessUntil(0);
    setSuccessRemaining(0);
    setImage("");
    setQuery("");
    setRanks(null);
    setGrade("");
    setRoom("");
    setPeriod("overall");
    setPromotion([]);
    setSelectedStudents([]);
    setError("");
    operationKey.current = null;
  };
  const home = () => {
    clearTimeout(successTimer.current);
    clear();
    api("logout", {}).catch(() => {});
    refresh().catch(() => {});
  };
  const { idleRemaining, setIdleRemaining, lastActivity, renewSession } =
    useKioskSession({
      active: page !== "home" || Boolean(modal),
      accountKey: student?.id
        ? "student:" + student.id
        : staff
          ? "staff:" + staff
          : null,
      epoch: uiEpoch,
      api,
      clear,
      home,
      setError,
      setNotice,
    });
  useEffect(() => {
    if (page !== "success" || !successUntil) return;
    const update = () =>
      setSuccessRemaining(
        Math.max(0, Math.ceil((successUntil - Date.now()) / 1000)),
      );
    update();
    const countdown = setInterval(update, 1000);
    successTimer.current = setTimeout(
      home,
      Math.max(0, successUntil - Date.now()),
    );
    return () => {
      clearInterval(countdown);
      clearTimeout(successTimer.current);
    };
  }, [page, successUntil]);
  useEffect(() => {
    if (notice) {
      let t = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (modal?.type !== "identify" || id.length < 5 || lookup?.id === id)
      return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api("lookup", { id }, { signal: controller.signal })
        .then((p) => {
          if (!cancelled) {
            setLookup(p);
            setError("");
          }
        })
        .catch((e) => {
          if (!cancelled && !e.cancelled) setError(e.message);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, modal?.type]);
  useEffect(() => {
    if (modal) {
      lastFocus.current = document.activeElement;
      const timer = setTimeout(() => {
        const dialog = modalRef.current;
        if (!dialog || dialog.contains(document.activeElement)) return;
        (
          [...dialog.querySelectorAll("input,select,textarea")].find(
            (element) =>
              !element.matches(":disabled") && element.getClientRects().length,
          ) || dialog.querySelector("button:not(:disabled)")
        )?.focus();
      }, 30);
      return () => clearTimeout(timer);
    } else lastFocus.current?.focus?.();
  }, [modal?.type]);
  async function run(fn) {
    if (inFlight.current) return;
    const version = ++runVersion.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (!e.cancelled) setError(e.message);
    } finally {
      if (version === runVersion.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  const action = async (action, payload) => {
    const signature = JSON.stringify({ action, payload });
    if (operationKey.current?.signature !== signature)
      operationKey.current = {
        signature,
        key: Date.now() + ":" + crypto.randomUUID(),
      };
    let result = await api("action", {
      action,
      payload,
      key: operationKey.current.key,
      ...(student?.id ? { expectedStudent: student.id } : {}),
    });
    operationKey.current = null;
    return result;
  };
  const done = (title, description, code, pickupInstructions) => {
    uiEpoch.current++;
    invalidateRequests();
    setModal(null);
    setStudent(null);
    setLookup(null);
    setId("");
    setPhoto("");
    setDisposalPhoto("");
    setNote("");
    setCount("");
    setSuccess({ title, description, code, pickupInstructions });
    setPage("success");
    api("logout", {}).catch(() => {});
    refresh().catch(() => {});
    setSuccessRemaining(Math.ceil(policy.successMs / 1000));
    setSuccessUntil(Date.now() + policy.successMs);
  };
  const {
    refresh: readAdmin,
    ready: adminReady,
    loading: adminLoading,
    failed: adminFailed,
  } = useAdminData({
    enabled: Boolean(staff) && page === "admin",
    tab: ["reports", "promotion"].includes(adminTab) ? "dashboard" : adminTab,
    page: adminPage,
    query,
    epoch: uiEpoch,
    setData: setAdmin,
    setError,
  });
  const admin = adminReady
    ? adminData
    : adminData
      ? {
          ...adminData,
          students: [],
          submissions: [],
          redemptions: [],
          ledger: [],
          audit: [],
          rewards: [],
          hasMore: false,
        }
      : null;
  async function refreshAdmin(
    target = adminTab,
    offset = adminPage,
    search = query,
  ) {
    return readAdmin(
      ["reports", "promotion"].includes(target) ? "dashboard" : target,
      offset,
      search,
    );
  }
  useEffect(() => {
    setAdminPage(0);
    setSelectedStudents([]);
  }, [adminTab, query]);
  useEffect(() => {
    setSelectedStudents([]);
  }, [adminPage]);
  async function loadStudent() {
    const result = await api("student");
    setStudent(result);
    return result;
  }
  const studentHistoryQuery = (changes = {}) =>
    "student?" +
    new URLSearchParams({
      page: student?.page || 0,
      submissionPage: student?.submissionPage || 0,
      submissionStatus: student?.submissionStatus || "",
      ...changes,
    });
  const refreshStudentHistory = (changes = {}) =>
    run(async () => {
      setStudent(await api(studentHistoryQuery(changes)));
    });
  function identify(next, reward) {
    uiEpoch.current++;
    invalidateRequests();
    operationKey.current = null;
    setCount("");
    setNote("");
    setPhoto("");
    setDisposalPhoto("");
    setError("");
    setId("");
    setLookup(null);
    setModal({ type: "identify", next, reward });
  }
  function navigate(target) {
    uiEpoch.current++;
    runVersion.current++;
    inFlight.current = false;
    setBusy(false);
    operationKey.current = null;
    invalidateRequests();
    if (target === "home") {
      home();
      return;
    }
    if (staff) {
      setStaff(null);
      setAdmin(null);
      api("logout", {}).catch(() => {});
    }
    setError("");
    setQuery("");
    if (target === "submit" || target === "account") identify(target);
    else {
      setPage(target);
      if (target === "shop")
        refresh().catch((error) => {
          if (!error.cancelled) setError(error.message);
        });
    }
  }
  async function readImage(file, fn) {
    const epoch = uiEpoch.current;
    const result = await compressImage(file);
    if (epoch !== uiEpoch.current)
      throw Object.assign(new Error("ยกเลิกแล้ว"), { cancelled: true });
    if (result) fn(result);
  }
  const leaderboard = useLeaderboard({
    active: page === "leaderboard",
    period,
    grade,
    room,
  });
  const ranked =
    page === "leaderboard" ? leaderboard.rows : data?.leaderboard || [];
  const studentName = (id) => admin?.students.find((s) => s.id === id);
  // The server owns filtering and pagination; filter again would hide valid rows
  // when its matching rules differ from the presentation's display string.
  const visibleStudents = admin?.students || [];
  const toggleStudent = (id) =>
    setSelectedStudents((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const toggleVisibleStudents = () =>
    setSelectedStudents((current) =>
      visibleStudents.every((s) => current.includes(s.id))
        ? current.filter((id) => !visibleStudents.some((s) => s.id === id))
        : [...new Set([...current, ...visibleStudents.map((s) => s.id)])],
    );
  const openRewardImage = (images, index) =>
    setImage({ sources: images.map((item) => item.src), index });
  function startPromotion() {
    run(async () => {
      const result = await api("promotion");
      setYear(result.year);
      setPreviewVersion(result.previewVersion);
      setPromotion(
        result.students.map((s) => ({
          ...s,
          oldGrade: s.grade,
          grade: String(Math.min(6, Number(s.grade) + 1)),
          status: s.grade === "6" ? "Alumni" : "Active",
        })),
      );
      setAdminTab("promotion");
    });
  }
  function openModal(value) {
    setError("");
    setModal(value);
  }
  const pageTitles = {
    shop: "ร้านรางวัล",
    leaderboard: "ทำเนียบคนรักษ์โลก",
    account: "Coins ของฉัน",
    submit: "ถ่ายรูปการทิ้งขยะ",
  };
  const navItems = [
    ["home", Home, "หน้าหลัก"],
    ["submit", Recycle, "ส่งขยะ"],
    ["account", Coins, "Coins ของฉัน"],
    ["shop", Gift, "ร้านรางวัล"],
    ["leaderboard", Trophy, "อันดับ"],
  ];
  const submitModal = (fn) => (e) => {
    e.preventDefault();
    if (!validateForm(e.currentTarget)) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    run(() => fn(values));
  };
  return (
    <>
      <header>
        <button className="brand" onClick={home}>
          <span className="brand-icon">
            <Recycle size={27} />
          </span>
          <span>
            waste-<span className="brand-light">bank</span>
            <small>SCHOOL RECYCLING CLUB</small>
          </span>
        </button>
        <nav aria-label="เมนูหลัก">
          {navItems.map(([key, Icon, label]) => (
            <button
              key={key}
              className={`${page === key ? "active" : ""} ${key === "submit" ? "submit-nav" : ""}`}
              aria-current={page === key ? "page" : undefined}
              onClick={() => navigate(key)}
            >
              <Icon size={key === "submit" ? 23 : 19} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button
          className="staff-link"
          onClick={() =>
            staff ? setPage("admin") : openModal({ type: "login" })
          }
        >
          <ShieldCheck size={17} />
          <span>{staff || "เจ้าหน้าที่"}</span>
        </button>
      </header>
      <main
        onInvalidCapture={handleInvalid}
        onInputCapture={(event) => clearFieldError(event.target)}
      >
        {error && !modal && (
          <div className="alert" role="alert">
            <AlertCircle size={20} />
            {error}
            <button
              onClick={() => {
                if (error === sessionRetryMessage) {
                  renewSession();
                } else if (
                  page === "submit" &&
                  error.startsWith("เชื่อมต่อไม่ได้")
                ) {
                  document.getElementById("submission-form")?.requestSubmit();
                } else {
                  setError("");
                  if (!data) refresh().catch((e) => setError(e.message));
                }
              }}
            >
              {error === sessionRetryMessage
                ? "ลองเชื่อมต่ออีกครั้ง"
                : page === "submit" && error.startsWith("เชื่อมต่อไม่ได้")
                  ? "ส่งรายการเดิมอีกครั้ง"
                  : "ลองใหม่"}
            </button>
          </div>
        )}
        {!data ? (
          <div className="skeleton">
            <div />
            <div />
            <div />
          </div>
        ) : (
          <>
            {page === "home" && (
              <>
                <div className="eyebrow">
                  <span className="live-dot" /> พื้นที่เล็ก ๆ เพื่อโลกที่ดีขึ้น{" "}
                  <span className="date">
                    {new Date().toLocaleDateString("th-TH", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <section className="home-grid">
                  <div className="hero">
                    <div className="hero-tag">
                      <Leaf size={16} /> ธนาคารขยะโรงเรียน
                    </div>
                    <h1>
                      ขยะของเธอ
                      <br />
                      มีค่า<span>กว่าที่คิด.</span>
                    </h1>
                    <p>
                      แยกขยะ สะสม Coins แลกของที่ชอบ
                      <br />
                      มาเปลี่ยนโรงเรียนให้น่าอยู่ไปด้วยกัน
                    </p>
                    <button
                      className="btn lime"
                      onClick={() => navigate("submit")}
                    >
                      เริ่มส่งขยะ <ArrowUpRight size={23} />
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() => {
                        setModal({ type: "register", next: "account" });
                        setError("");
                      }}
                    >
                      สมัครสมาชิกนักเรียน
                    </button>
                    <div className="hero-bottom">
                      <Leaf size={18} aria-hidden="true" />
                      <span>ทุกชิ้นที่แยก คืออีกก้าวที่สำคัญ</span>
                    </div>
                    <div className="recycle-mark" aria-hidden="true">
                      <Recycle strokeWidth={1.1} />
                      <span>
                        MAKE IT
                        <br />
                        CIRCULAR
                      </span>
                    </div>
                  </div>
                  <div className="quick-actions">
                    <button
                      className="action-card coin-card"
                      onClick={() => navigate("account")}
                    >
                      <span className="action-icon">
                        <Coins />
                      </span>
                      <ArrowUpRight className="corner-arrow" />
                      <div>
                        <small>บัญชีของฉัน</small>
                        <h2>ดู Coins และประวัติ</h2>
                        <p>เช็กยอดสะสมและประวัติของฉัน</p>
                      </div>
                    </button>
                    <button
                      className="action-card shop-card"
                      onClick={() => navigate("shop")}
                    >
                      <span className="action-icon">
                        <Gift />
                      </span>
                      <ArrowUpRight className="corner-arrow" />
                      <div>
                        <small>ร้านรางวัล</small>
                        <h2>เลือกแลกรางวัล</h2>
                        <p>เลือกของที่ชอบ แล้วใช้ Coins แลกเลย</p>
                      </div>
                    </button>
                  </div>
                </section>
                <section className="impact">
                  <div>
                    <span className="eyebrow">OUR COLLECTIVE IMPACT</span>
                    <h3>พลังเล็ก ๆ ของพวกเรา</h3>
                  </div>
                  <div className="metric">
                    <span className="metric-icon">
                      <Recycle />
                    </span>
                    <div>
                      <strong>
                        {fmt(data.stats.submissions)} <small>ครั้ง</small>
                      </strong>
                      <p>รายการขยะที่อนุมัติแล้ว</p>
                    </div>
                  </div>
                  <div className="metric">
                    <span className="metric-icon">
                      <Coins />
                    </span>
                    <div>
                      <strong className="gold-coin-total">
                        {fmt(data.stats.coins)}
                      </strong>
                      <p>Coins ที่มอบให้</p>
                    </div>
                  </div>
                  <div className="metric">
                    <span className="metric-icon">
                      <Users />
                    </span>
                    <div>
                      <strong>
                        {fmt(data.stats.students)} <small>คน</small>
                      </strong>
                      <p>เพื่อนร่วมรักษ์โลก</p>
                    </div>
                  </div>
                </section>
                <RecyclingGuide data={data} />
                <section className="lower-grid">
                  <div className="how">
                    <div className="section-heading">
                      <h2>เปลี่ยนขยะเป็นรางวัล</h2>
                      <span>ง่าย ๆ แค่ 3 ขั้นตอน</span>
                    </div>
                    <div className="steps">
                      {[
                        [
                          Camera,
                          "แยกแล้วถ่าย",
                          "แยกขยะ ทิ้งถูกที่ ถ่ายรูปและกรอกจำนวน",
                        ],
                        [ShieldCheck, "รอครูตรวจ", "รับ Coins เมื่ออนุมัติ"],
                        [Gift, "แลกของที่ชอบ", "รับรางวัลกับคุณครู"],
                      ].map(([Icon, title, desc], i) => (
                        <div key={title}>
                          <span className="step-icon">
                            <Icon />
                            <b>0{i + 1}</b>
                          </span>
                          <h4>{title}</h4>
                          <p>{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="top-card">
                    <div className="section-heading">
                      <h2>
                        <Trophy size={20} /> Eco heroes
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => setPage("leaderboard")}
                      >
                        ดูทั้งหมด <ArrowRight size={16} />
                      </button>
                    </div>
                    {data.leaderboard.slice(0, 3).map((p, i) => (
                      <div className="mini-rank" key={p.name}>
                        <span className={"rank-number rank-" + i}>{i + 1}</span>
                        <span className="avatar">{p.name.slice(0, 1)}</span>
                        <div>
                          <b>{p.name}</b>
                          <small>
                            ม.{p.grade}/{p.room}
                          </small>
                        </div>
                        <strong>
                          {fmt(p.earned)} <Coins size={14} />
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
            {["shop", "leaderboard", "account", "submit"].includes(page) && (
              <div className="page-heading">
                <div>
                  <button className="back" onClick={home}>
                    <ArrowLeft size={17} /> หน้าหลัก
                  </button>
                  <h1
                    className={
                      page === "submit" ? "submit-page-title" : undefined
                    }
                  >
                    {page === "submit" && (
                      <span>
                        <Recycle size={28} aria-hidden="true" />
                      </span>
                    )}
                    {pageTitles[page]}
                  </h1>
                </div>
                <span className="privacy">
                  <ShieldCheck size={16} /> กลับหน้าหลักอัตโนมัติเมื่อไม่ใช้งาน
                  90 วินาที
                </span>
              </div>
            )}
            {page === "shop" && (
              <>
                <div className="shop-banner">
                  <span>
                    <Gift /> เปลี่ยนความตั้งใจดี ให้เป็นของรางวัลที่ชอบ
                  </span>
                  <small>แลกแล้วรับของกับเจ้าหน้าที่ที่จุดรับรางวัล</small>
                </div>
                <div className="rewards-grid">
                  {data.rewards.map((reward) => (
                    <article className="reward-card" key={reward.id}>
                      <RewardArt reward={reward} onOpen={openRewardImage} />
                      <div className="reward-body">
                        <div className="reward-stock">
                          {reward.stock > 0
                            ? `เหลือ ${reward.stock} ชิ้น`
                            : "ของหมดแล้ว"}
                          {reward.stock > 0 && reward.stock <= 3 && (
                            <span>ใกล้หมด</span>
                          )}
                        </div>
                        <h2>{reward.name}</h2>
                        <p>{reward.description}</p>
                        <div className="reward-bottom">
                          <strong>
                            <Coins size={21} />
                            {fmt(reward.price)}
                          </strong>
                          <button
                            disabled={!reward.stock}
                            className="btn primary"
                            onClick={() => identify("redeem", reward)}
                          >
                            แลกรางวัล <ArrowUpRight size={18} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
            {page === "submit" && student && (
              <SubmitWaste
                student={student}
                data={data}
                photo={photo}
                disposalPhoto={disposalPhoto}
                category={category}
                count={count}
                note={note}
                busy={busy}
                setPhoto={setPhoto}
                setDisposalPhoto={setDisposalPhoto}
                setCategory={setCategory}
                setCount={setCount}
                setNote={setNote}
                readImage={readImage}
                run={run}
                identify={identify}
                onSubmit={() =>
                  run(async () => {
                    await action("submit", {
                      image: photo,
                      disposalImage: disposalPhoto,
                      category,
                      count,
                      note,
                    });
                    done(
                      "ส่งขยะเรียบร้อย!",
                      "รอเจ้าหน้าที่ตรวจสอบ เมื่ออนุมัติแล้ว Coins จะเข้าในบัญชีของเธอ",
                    );
                  })
                }
              />
            )}
            {page === "account" && student && (
              <>
                <div className="wallet">
                  <div>
                    <span className="eyebrow">MY ECO WALLET</span>
                    <h2>{student.name}</h2>
                    <p>
                      ม.{student.grade}/{student.room} · เลขที่{" "}
                      {student.number || "—"} · รหัส {student.id}
                    </p>
                    <button
                      className="btn ghost"
                      onClick={() => openModal({ type: "profile", p: student })}
                    >
                      แก้ไขโปรไฟล์
                    </button>
                  </div>
                  <div className="wallet-balance">
                    <span>Coins ที่ใช้ได้</span>
                    <strong>
                      <Coins size={40} />
                      {fmt(student.balance)}
                    </strong>
                  </div>
                  <div className="wallet-stats">
                    <p>
                      สะสมทั้งหมด <b>{fmt(student.earned)}</b>
                    </p>
                    <p>
                      อันดับโรงเรียน <b>#{student.rank}</b>
                    </p>
                    <p>
                      อนุมัติทั้งหมด{" "}
                      <b>
                        {student.submissionStatusCounts?.Approved ??
                          student.submissions.filter(
                            (x) => x.status === "Approved",
                          ).length}{" "}
                        ครั้ง
                      </b>
                    </p>
                  </div>
                </div>
                <div className="tabs">
                  {[
                    ["trash", "ประวัติส่งขยะ"],
                    ["coins", "ประวัติ Coins"],
                    ["rewards", "ประวัติรางวัล"],
                  ].map(([t, label]) => (
                    <button
                      key={t}
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="panel">
                  {tab === "trash" && (
                    <SubmissionHistory
                      key={student.id}
                      student={student}
                      rates={data.recyclingRates || recyclingRates}
                      onPhoto={setImage}
                      onCancel={(s) =>
                        openModal({ type: "cancelSubmission", item: s })
                      }
                      busy={busy}
                      onRefresh={() => refreshStudentHistory()}
                      onFilter={(submissionStatus) =>
                        refreshStudentHistory({
                          submissionStatus,
                          submissionPage: 0,
                        })
                      }
                      onPage={(submissionPage) =>
                        refreshStudentHistory({ submissionPage })
                      }
                    />
                  )}
                  {tab === "coins" && (
                    <>
                      {!student.ledger.length && <Empty />}
                      {student.ledger.map((t) => (
                        <div className="ledger-row" key={t.id}>
                          <span
                            className={
                              "transaction-icon " +
                              (t.amount < 0 ? "debit" : "")
                            }
                          >
                            <Coins />
                          </span>
                          <div className="grow">
                            <b>{t.reason}</b>
                            <small>
                              {date(t.at)}
                              {t.staff ? " · " + t.staff : ""}
                            </small>
                          </div>
                          <strong
                            className={t.amount < 0 ? "danger" : "positive"}
                          >
                            {t.amount > 0 ? "+" : ""}
                            {fmt(t.amount)}
                          </strong>
                        </div>
                      ))}
                    </>
                  )}
                  {tab === "rewards" && (
                    <>
                      {!student.redemptions.length && <Empty />}
                      {student.redemptions.map((r) => (
                        <div className="history-row" key={r.id}>
                          <span className="transaction-icon">
                            <Gift />
                          </span>
                          <div className="grow">
                            <b>{r.name}</b>
                            <small>{date(r.at)}</small>
                            <code>{r.code}</code>
                            <small className="pickup-instructions">
                              {r.pickupInstructions ||
                                "กรุณาติดต่อเจ้าหน้าที่ที่จุดรับรางวัล"}
                            </small>
                          </div>
                          <Badge status={r.status} />
                          <strong>{r.cost} Coins</strong>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
            {page === "leaderboard" && (
              <>
                <div className="leader-intro">
                  <span className="hero-tag">
                    <Trophy size={17} /> EVERY LITTLE ACTION COUNTS
                  </span>
                  <h2>เก่งมากเลย เหล่าฮีโร่รักษ์โลก!</h2>
                  <p>
                    อันดับจาก Coins ที่สะสมได้ · ใช้ Coins
                    แลกรางวัลแล้วอันดับไม่ลด
                  </p>
                </div>
                <div className="filters">
                  <div className="tabs compact">
                    {[
                      ["overall", "ทั้งหมด"],
                      ["month", "เดือนนี้"],
                      ["grade", "ระดับชั้น"],
                      ["class", "ห้องเรียน"],
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
                    {Array.from(
                      { length: policy.maxRoom },
                      (_, i) => i + 1,
                    ).map((n) => (
                      <option key={n} value={n}>
                        ห้อง {n}
                      </option>
                    ))}
                  </select>
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
                  <form
                    className="search-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () =>
                        setRanks(
                          await api(
                            "rank?" +
                              new URLSearchParams({
                                q: query,
                                period,
                                grade,
                                room,
                              }),
                          ),
                        ),
                      );
                    }}
                  >
                    <Search />
                    <input
                      aria-label="ค้นหาอันดับ"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="ค้นหาอันดับของเธอด้วยชื่อหรือรหัสนักเรียน"
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
              </>
            )}
            {page === "success" && success && (
              <div className="success-screen">
                <div className="success-icon">
                  <CheckCircle2 size={64} />
                </div>
                <span className="eyebrow">
                  ONE MORE GOOD THING FOR OUR PLANET
                </span>
                <h1>{success.title}</h1>
                <p>{success.description}</p>
                {success.code && (
                  <div className="pickup-code">
                    <span>รหัสรับรางวัล · แสดงให้เจ้าหน้าที่</span>
                    <strong>{success.code}</strong>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        run(async () => {
                          try {
                            await navigator.clipboard.writeText(success.code);
                            setNotice("คัดลอกรหัสรับรางวัลแล้ว");
                          } catch {
                            throw new Error(
                              "คัดลอกไม่ได้ กรุณาจดรหัสหรือถ่ายภาพหน้าจอไว้",
                            );
                          }
                        })
                      }
                      disabled={busy}
                    >
                      คัดลอกรหัส
                    </button>
                    <p className="pickup-instructions">
                      {success.pickupInstructions ||
                        "กรุณาติดต่อเจ้าหน้าที่ที่จุดรับรางวัล"}
                    </p>
                    <small>ดูรหัสนี้อีกครั้งได้ในประวัติรางวัล</small>
                  </div>
                )}
                <button className="btn primary" onClick={home}>
                  กลับหน้าหลัก <Home size={18} />
                </button>
                <button
                  className="btn secondary"
                  onClick={() => {
                    lastActivity.current = Date.now();
                    setSuccessRemaining(Math.ceil(policy.successMs / 1000));
                    setSuccessUntil(Date.now() + policy.successMs);
                  }}
                >
                  ใช้งานต่อ
                </button>
                <small>
                  กลับหน้าหลักและล้างข้อมูลใน {successRemaining} วินาที
                </small>
              </div>
            )}
            {page === "admin" && admin && (
              <StaffWorkspace
                view={{
                  data: { admin, publicData: data, staff },
                  navigation: {
                    tab: adminTab,
                    page: adminPage,
                    query,
                    auditCategory: category,
                    reportRefresh,
                  },
                  status: { busy, loading: adminLoading, failed: adminFailed },
                  selection: { ids: selectedStudents, rows: visibleStudents },
                  promotion: { year, rows: promotion },
                }}
                actions={{
                  onNavigateTab: (key) => {
                    setQuery("");
                    key === "promotion" ? startPromotion() : setAdminTab(key);
                  },
                  onRefresh: () =>
                    adminTab === "reports"
                      ? setReportRefresh((value) => value + 1)
                      : run(refreshAdmin),
                  onMaintenance: () =>
                    run(async () => {
                      await api("maintenance", {});
                      await refreshAdmin();
                    }),
                  onStudentHistory: (selected) =>
                    run(async () => {
                      const profile = await api("student?id=" + selected.id);
                      openModal({ type: "studentDetail", p: profile });
                    }),
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
                }}
              />
            )}
          </>
        )}
        {page === "account" && tab !== "trash" && student?.hasMore && (
          <button
            className="btn secondary"
            onClick={() =>
              run(async () => {
                const next = await api(
                  studentHistoryQuery({ page: student.page + 1 }),
                );
                setStudent({
                  ...next,
                  ledger: [...student.ledger, ...next.ledger],
                  submissions: next.submissions,
                  redemptions: [...student.redemptions, ...next.redemptions],
                });
              })
            }
          >
            โหลดประวัติเพิ่ม
          </button>
        )}
      </main>
      <footer>
        <span>
          <Recycle size={17} /> WASTE-BANK{" "}
          <span className="footer-separator">/</span> ทำสิ่งเล็ก ๆ ให้โลกทุกวัน
        </span>
        <span>พัฒนาโดย ประกาศิต สุริยะ</span>
      </footer>
      {idleRemaining !== null && (
        <div className="idle-warning" role="alert">
          จะออกจากระบบใน {idleRemaining} วินาที{" "}
          <button
            className="btn primary"
            onClick={() => {
              lastActivity.current = Date.now();
              setIdleRemaining(null);
              if (student || staff) renewSession();
            }}
          >
            ใช้งานต่อ
          </button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          {notice}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className={
              "modal" + (modal.type === "review" ? " review-modal" : "")
            }
            onInvalidCapture={handleInvalid}
            onInputCapture={(event) => clearFieldError(event.target)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={modalRef}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) setModal(null);
              if (e.key === "Tab") {
                const els = [
                  ...modalRef.current.querySelectorAll(
                    'button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]',
                  ),
                ].filter(
                  (element) =>
                    !element.matches(":disabled") &&
                    element.getClientRects().length,
                );
                let first = els[0],
                  last = els.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <button
              className="modal-close"
              aria-label="ปิด"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            {modal.type === "identify" && (
              <>
                <span className="modal-symbol">
                  <Users />
                </span>
                <h2 id="modal-title">เข้าสู่ระบบนักเรียน</h2>
                <p className="muted">ใส่เลขประจำตัวนักเรียนเพื่อดูบัญชีเดิม</p>
                <form
                  onSubmit={submitModal(async () => {
                    if (!lookup) {
                      setLookup(await api("lookup", { id }));
                      return;
                    }
                    await api("identify", { id });
                    await loadStudent();
                    const next = modal.next;
                    if (next === "redeem") {
                      setModal({ type: "redeem", reward: modal.reward });
                    } else {
                      setPage(next);
                      setModal(null);
                      setCategory("ขวดพลาสติก");
                    }
                  })}
                >
                  <Field label="เลขประจำตัวนักเรียน">
                    <input
                      autoFocus
                      inputMode="numeric"
                      value={id}
                      onChange={(e) => {
                        const value = e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 10);
                        setId(value);
                        setLookup(null);
                      }}
                      required
                      placeholder="เลขประจำตัวนักเรียน"
                    />
                  </Field>
                  {lookup && (
                    <div className="identity">
                      <span className="avatar">{lookup.name[0]}</span>
                      <div>
                        <b>{lookup.name}</b>
                        <p>
                          ม.{lookup.grade}/{lookup.room} · เลขที่{" "}
                          {lookup.number || "—"}
                        </p>
                      </div>
                      <CheckCircle2 />
                    </div>
                  )}
                  <ActionButton busy={busy} type="submit">
                    {lookup ? "ใช่ นี่คือบัญชีของฉัน" : "ตรวจสอบรหัส"}{" "}
                    <ArrowRight size={18} />
                  </ActionButton>
                </form>
                <p className="muted">ยังไม่มีบัญชี?</p>
                <button
                  className="btn secondary"
                  onClick={() => setModal({ ...modal, type: "register" })}
                >
                  สมัครสมาชิกใหม่
                </button>
              </>
            )}
            {modal.type === "register" && (
              <>
                <span className="modal-symbol">
                  <Users />
                </span>
                <h2 id="modal-title">สมัครสมาชิกนักเรียน</h2>
                <p className="muted">กรอกข้อมูลนักเรียน ไม่มีรหัสผ่าน</p>
                <form
                  onSubmit={submitModal(async (v) => {
                    await api("register", v);
                    await loadStudent();
                    await refresh();
                    const next = modal.next;
                    if (next === "redeem") {
                      setModal({ type: "redeem", reward: modal.reward });
                    } else {
                      setPage(next);
                      setModal(null);
                      setCategory("ขวดพลาสติก");
                    }
                  })}
                >
                  <Field label="ชื่อ–นามสกุล">
                    <input
                      name="name"
                      autoFocus
                      required
                      maxLength="80"
                      placeholder="ชื่อและนามสกุล"
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="เลขที่">
                      <input
                        name="number"
                        type="number"
                        min="1"
                        max="60"
                        required
                        placeholder="เช่น 12"
                      />
                    </Field>
                    <Field label="เลขประจำตัวนักเรียน">
                      <input
                        name="id"
                        inputMode="numeric"
                        pattern="[0-9]{5,10}"
                        maxLength="10"
                        required
                        placeholder="เช่น 65123"
                      />
                    </Field>
                  </div>
                  <div className="form-grid">
                    <Field label="ระดับชั้น">
                      <select name="grade" required defaultValue="">
                        <option value="" disabled>
                          เลือก ม.
                        </option>
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n} value={n}>
                            ม.{n}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="ห้อง">
                      <input
                        name="room"
                        type="number"
                        min="1"
                        max="30"
                        required
                        placeholder="เช่น 2"
                      />
                    </Field>
                  </div>
                  <ActionButton busy={busy} type="submit">
                    สมัครสมาชิก <ArrowRight size={18} />
                  </ActionButton>
                </form>
                <button
                  className="text-button"
                  onClick={() => setModal({ ...modal, type: "identify" })}
                >
                  มีบัญชีแล้ว? เข้าสู่ระบบ
                </button>
              </>
            )}
            {modal.type === "login" && (
              <>
                <span className="modal-symbol">
                  <ShieldCheck />
                </span>
                <h2 id="modal-title">สำหรับเจ้าหน้าที่</h2>
                <p className="muted">ใช้บัญชีและ PIN ของเจ้าหน้าที่แต่ละคน</p>
                <form
                  onSubmit={submitModal(async (v) => {
                    const result = await api("login", v);
                    setStaff(result.name);
                    await refreshAdmin("dashboard", 0, "");
                    setPage("admin");
                    setAdminTab("dashboard");
                    setModal(null);
                  })}
                >
                  <Field label="บัญชีเจ้าหน้าที่">
                    <input
                      name="id"
                      autoComplete="username"
                      required
                      placeholder="ชื่อบัญชีเจ้าหน้าที่"
                    />
                  </Field>
                  <Field label="PIN ส่วนตัว">
                    <input
                      name="pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="current-password"
                      required
                    />
                  </Field>
                  <ActionButton busy={busy}>
                    เข้าสู่ระบบ <ArrowRight size={18} />
                  </ActionButton>
                </form>
              </>
            )}
            {modal.type === "redeem" && (
              <>
                <span className="modal-symbol">
                  <Gift />
                </span>
                <h2 id="modal-title">ยืนยันแลกรางวัล</h2>
                <div className="redemption-summary">
                  <b>{modal.reward.name}</b>
                  <strong>{modal.reward.price} Coins</strong>
                </div>
                <p>
                  {student?.name} · ยอดคงเหลือ {fmt(student?.balance)} Coins
                </p>
                <p className="pickup-instructions">
                  {modal.reward.pickupInstructions ||
                    "กรุณาติดต่อเจ้าหน้าที่ที่จุดรับรางวัล"}
                </p>
                <form
                  onSubmit={submitModal(async (v) => {
                    const result = await action("redeem", {
                      id: modal.reward.id,
                    });
                    done(
                      "จองรางวัลแล้ว!",
                      "Coins ถูกหักเรียบร้อย สถานะ: รอรับรางวัล",
                      result.code,
                      result.pickupInstructions,
                    );
                  })}
                >
                  <ActionButton
                    busy={busy}
                    disabled={busy || student?.balance < modal.reward.price}
                  >
                    ยืนยันแลก {modal.reward.price} Coins
                  </ActionButton>
                  {student?.balance < modal.reward.price && (
                    <p className="danger">
                      Coins ยังไม่เพียงพอ มาแยกขยะเพิ่มกัน!
                    </p>
                  )}
                </form>
              </>
            )}
            {modal.type === "cancelSubmission" && (
              <>
                <h2 id="modal-title">ยกเลิกการส่งขยะ?</h2>
                <p>
                  {modal.item.category} · รายการนี้จะไม่ถูกตรวจเพื่อรับ Coins
                </p>
                <form
                  onSubmit={submitModal(async (v) => {
                    await action("cancelSubmission", { id: modal.item.id });
                    done(
                      "ยกเลิกรายการแล้ว",
                      "สามารถส่งหลักฐานใหม่ได้จากหน้าหลัก",
                    );
                  })}
                >
                  <ActionButton busy={busy}>ยืนยันยกเลิก</ActionButton>
                </form>
              </>
            )}
            {modal.type === "profile" && (
              <>
                <h2 id="modal-title">แก้ไขข้อมูลนักเรียน</h2>
                <form
                  onSubmit={submitModal(async (v) => {
                    await action("profile", { ...v, id: modal.p.id });
                    if (modal.adminMode) {
                      await refreshAdmin();
                      setModal(null);
                      setNotice("บันทึกข้อมูลแล้ว");
                    } else
                      done(
                        "บันทึกข้อมูลแล้ว",
                        "ข้อมูลโปรไฟล์ได้รับการอัปเดตเรียบร้อย",
                      );
                  })}
                >
                  <ProfileForm p={modal.p} adminMode={modal.adminMode} />
                  <ActionButton busy={busy}>บันทึกข้อมูล</ActionButton>
                </form>
              </>
            )}
            {modal.type === "deleteStudents" && (
              <>
                <h2 id="modal-title">ลบนักเรียน {modal.ids.length} คน?</h2>
                <p>
                  ข้อมูลนักเรียน Coins ประวัติส่งขยะ ประวัติรางวัล
                  และรูปหลักฐานที่เกี่ยวข้องจะถูกลบ
                  ไม่สามารถกู้คืนจากหน้าเว็บได้
                </p>
                <div className="delete-student-list">
                  {modal.ids.map((id) => (
                    <span key={id}>
                      {admin.students.find((s) => s.id === id)?.name} · {id}
                    </span>
                  ))}
                </div>
                <form
                  onSubmit={submitModal(async (v) => {
                    const result = await action("deleteStudents", {
                      ids: modal.ids,
                      confirm: v.confirm === "on",
                      pin: v.pin,
                    });
                    await refreshAdmin();
                    setSelectedStudents([]);
                    setModal(null);
                    setNotice(
                      result.imageCleanupPending
                        ? `ลบนักเรียน ${result.deleted} คนแล้ว รูปใน Drive อีก ${result.imageCleanupPending} รูปรอลบอัตโนมัติ`
                        : `ลบนักเรียน ${result.deleted} คนและข้อมูลที่เกี่ยวข้องแล้ว`,
                    );
                  })}
                >
                  <label className="checkbox">
                    <input name="confirm" type="checkbox" required />{" "}
                    ยืนยันว่าตรวจรายชื่อแล้วและต้องการลบข้อมูลเหล่านี้
                  </label>
                  <Field label="ยืนยัน PIN เจ้าหน้าที่">
                    <input
                      name="pin"
                      type="password"
                      autoComplete="off"
                      maxLength="128"
                      required
                    />
                  </Field>
                  <ActionButton busy={busy}>
                    ยืนยันลบ {modal.ids.length} คน
                  </ActionButton>
                </form>
              </>
            )}
            {modal.type === "review" && (
              <ReviewDialog
                key={modal.item.id}
                item={modal.item}
                studentName={studentName(modal.item.student)?.name}
                status={modal.status}
                rates={data.recyclingRates || recyclingRates}
                busy={busy}
                onStatus={(status) => {
                  setError("");
                  setModal((current) => ({ ...current, status }));
                }}
                onPhoto={setImage}
                onSubmit={submitModal(async (values) => {
                  await action("review", {
                    ...values,
                    id: modal.item.id,
                    status: modal.status,
                  });
                  await refreshAdmin();
                  setModal(null);
                  setNotice("บันทึกผลตรวจแล้ว");
                })}
              />
            )}
            {["handover", "cancelReward"].includes(modal.type) && (
              <>
                <h2 id="modal-title">
                  {modal.type === "handover"
                    ? "ยืนยันส่งมอบรางวัล"
                    : "ยกเลิกและคืน Coins"}
                </h2>
                <p>
                  {modal.item.name} · {studentName(modal.item.student)?.name}
                </p>
                <code>{modal.item.code}</code>
                <form
                  onSubmit={submitModal(async (v) => {
                    await action(modal.type, {
                      id: modal.item.id,
                      verified: v.verified === "on",
                      reason: v.reason,
                    });
                    await refreshAdmin();
                    setModal(null);
                    setNotice("บันทึกรายการแล้ว");
                  })}
                >
                  {modal.type === "handover" ? (
                    <label className="checkbox">
                      <input name="verified" type="checkbox" required />{" "}
                      ตรวจสอบบัตรนักเรียนและส่งมอบของแล้ว
                    </label>
                  ) : (
                    <>
                      <p>
                        คืน {modal.item.cost} Coins และคืนสินค้า 1
                        ชิ้นเข้าสู่สต็อก
                      </p>
                      <Field label="เหตุผล">
                        <textarea name="reason" required minLength={3} />
                      </Field>
                    </>
                  )}
                  <ActionButton busy={busy}>ยืนยัน</ActionButton>
                </form>
              </>
            )}
            {modal.type === "adjust" && (
              <>
                <h2 id="modal-title">ปรับ Coins</h2>
                <p>
                  {modal.p.name} · ยอดปัจจุบัน {fmt(modal.p.balance)} Coins
                </p>
                <form
                  onSubmit={submitModal(async (v) => {
                    await action("adjust", {
                      ...v,
                      id: modal.p.id,
                      confirmLarge: v.confirmLarge === "on",
                    });
                    await refreshAdmin();
                    setModal(null);
                    setNotice("สร้างรายการปรับ Coins แล้ว");
                  })}
                >
                  <Field label="จำนวน (+ เพิ่ม / − ลด)">
                    <input
                      name="amount"
                      type="number"
                      min="-100000"
                      max="100000"
                      required
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        e.target.form.querySelector("output").textContent =
                          "ยอดใหม่: " + fmt(modal.p.balance + n) + " Coins";
                      }}
                    />
                  </Field>
                  <output>ยอดใหม่: {fmt(modal.p.balance)} Coins</output>
                  <Field label="เหตุผล">
                    <textarea name="reason" minLength={3} required />
                  </Field>
                  <label className="checkbox">
                    <input name="confirmLarge" type="checkbox" />{" "}
                    ยืนยันเพิ่มเติมเมื่อปรับตั้งแต่ 1,000 Coins
                  </label>
                  <ActionButton busy={busy}>
                    ยืนยันและบันทึกในบัญชี
                  </ActionButton>
                </form>
              </>
            )}
            {modal.type === "deleteReward" && (
              <>
                <h2 id="modal-title">ลบรางวัลนี้?</h2>
                <p>{modal.item.name}</p>
                <p>
                  รางวัลจะหายจากร้านและหน้าจัดการ ประวัติการแลกยังอยู่
                  รายการที่รอรับของยังส่งมอบหรือยกเลิกคืน Coins ได้
                </p>
                <ActionButton
                  busy={busy}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await action("deleteReward", {
                        id: modal.item.id,
                        version: modal.item.version,
                        confirm: true,
                      });
                      await refreshAdmin();
                      setModal(null);
                      setNotice("ลบรางวัลแล้ว ประวัติการแลกเดิมยังอยู่");
                    })
                  }
                >
                  ยืนยันลบรางวัล
                </ActionButton>
              </>
            )}
            {modal.type === "reward" && (
              <>
                <h2 id="modal-title">
                  {modal.item.id ? "แก้ไข" : "เพิ่ม"}รางวัล
                </h2>
                <form
                  onSubmit={submitModal(async (v) => {
                    await action("reward", {
                      ...v,
                      id: modal.item.id,
                      version: modal.item.version,
                      icon: modal.item.icon,
                      images: modal.item.images || [],
                      enabled: v.enabled === "on",
                    });
                    await refreshAdmin();
                    setModal(null);
                    setNotice("บันทึกรางวัลแล้ว");
                  })}
                >
                  <Field label="ชื่อรางวัล">
                    <input
                      name="name"
                      required
                      defaultValue={modal.item.name}
                    />
                  </Field>
                  <Field label="รายละเอียด">
                    <textarea
                      name="description"
                      defaultValue={modal.item.description}
                    />
                  </Field>
                  <Field label="ข้อความติดต่อรับรางวัล">
                    <textarea
                      name="pickupInstructions"
                      maxLength={500}
                      rows={3}
                      placeholder="เช่น ติดต่อครูมะลิ ที่ห้องกิจการนักเรียน เวลา 12.00–13.00 น. พร้อมแสดงรหัสรับรางวัล"
                      defaultValue={modal.item.pickupInstructions || ""}
                    />
                    <small>
                      ไม่เกิน 500 ตัวอักษร · ใช้กับการแลกครั้งใหม่
                      รายการเดิมเก็บข้อความ ณ วันที่แลก
                    </small>
                  </Field>
                  <div className="form-grid">
                    <Field label="ราคา Coins">
                      <input
                        name="price"
                        type="number"
                        min="1"
                        required
                        defaultValue={modal.item.price}
                      />
                    </Field>
                    <Field label="สต็อกที่เหลือ">
                      <input
                        name="stock"
                        type="number"
                        min="0"
                        required
                        defaultValue={modal.item.stock}
                      />
                    </Field>
                  </div>
                  <RewardImageEditor
                    images={modal.item.images || []}
                    onChange={(images) =>
                      setModal((m) => ({ ...m, item: { ...m.item, images } }))
                    }
                    readImage={readImage}
                    run={run}
                  />
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={modal.item.enabled}
                    />{" "}
                    เปิดให้แลกรางวัล
                  </label>
                  <ActionButton busy={busy}>บันทึกรางวัล</ActionButton>
                </form>
              </>
            )}
            {modal.type === "promote" && (
              <>
                <h2 id="modal-title">ยืนยันเลื่อนชั้นนักเรียน</h2>
                <p>
                  ปี {year} · ทั้งหมด {promotion.length} คน
                </p>
                <p>
                  ตรวจข้อยกเว้นในตารางแล้วหรือยัง? ปีนี้จะเลื่อนชั้นซ้ำอีกไม่ได้
                </p>
                <ActionButton
                  busy={busy}
                  onClick={() =>
                    run(async () => {
                      await action("promote", {
                        year,
                        previewVersion,
                        students: promotion.map(
                          ({ id, grade, room, number, status }) => ({
                            id,
                            grade,
                            room,
                            number,
                            status,
                          }),
                        ),
                        confirm: true,
                      });
                      await refreshAdmin();
                      setModal(null);
                      setAdminTab("students");
                      setNotice("เลื่อนชั้นเรียบร้อย ประวัติและ Coins คงเดิม");
                    })
                  }
                >
                  ยืนยันเลื่อนชั้น
                </ActionButton>
              </>
            )}
            {modal.type === "studentDetail" && (
              <>
                <h2 id="modal-title">{modal.p.name}</h2>
                <p>
                  ม.{modal.p.grade}/{modal.p.room} · เลขที่{" "}
                  {modal.p.number || "—"} · {modal.p.status} · อันดับ #
                  {modal.p.rank}
                </p>
                <h3>
                  {fmt(modal.p.balance)} Coins · สะสม {fmt(modal.p.earned)}
                </h3>
                <h3>ประวัติส่งขยะ</h3>
                {modal.p.submissions.map((s) => (
                  <div className="history-row" key={s.id}>
                    <div className="evidence-pair">
                      <Photo src={s.image} onClick={setImage} />
                      {s.disposalImage && (
                        <Photo src={s.disposalImage} onClick={setImage} />
                      )}
                    </div>
                    <span className="grow">
                      {s.category}
                      <small>{date(s.at)}</small>
                      {s.reason && <small>{s.reason}</small>}
                    </span>
                    <Badge status={s.status} />
                  </div>
                ))}
                <h3>บัญชี Coins</h3>
                {modal.p.ledger.map((t) => (
                  <div className="ledger-row" key={t.id}>
                    <span className="grow">
                      {t.reason}
                      <small>{date(t.at)}</small>
                    </span>
                    <b>
                      {t.amount > 0 ? "+" : ""}
                      {t.amount}
                    </b>
                  </div>
                ))}
                <h3>ประวัติรางวัล</h3>
                {modal.p.redemptions.map((r) => (
                  <div className="ledger-row" key={r.id}>
                    <span>
                      {r.name}
                      <small>{r.code}</small>
                      {r.completedAt && (
                        <small>
                          ส่งมอบ {date(r.completedAt)} · {r.staff}
                        </small>
                      )}
                    </span>
                    <Badge status={r.status} />
                  </div>
                ))}
                {modal.p.hasMore && (
                  <ActionButton
                    busy={busy}
                    onClick={() =>
                      run(async () => {
                        const previous = modal.p,
                          next = await api(
                            "student?" +
                              new URLSearchParams({
                                id: previous.id,
                                page: previous.page + 1,
                              }),
                          );
                        setModal((current) => ({
                          ...current,
                          p: {
                            ...next,
                            ledger: [...previous.ledger, ...next.ledger],
                            submissions: [
                              ...previous.submissions,
                              ...next.submissions,
                            ],
                            redemptions: [
                              ...previous.redemptions,
                              ...next.redemptions,
                            ],
                          },
                        }));
                      })
                    }
                  >
                    โหลดประวัติเพิ่ม
                  </ActionButton>
                )}
              </>
            )}
            {error && (
              <div className="alert" role="alert">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
          </section>
        </div>
      )}
      {image && (
        <div
          className="lightbox"
          role="dialog"
          aria-label="ภาพขยาย"
          aria-modal="true"
          onClick={() => setImage("")}
          onKeyDown={(e) => {
            if (
              typeof image === "object" &&
              ["ArrowLeft", "ArrowRight"].includes(e.key)
            ) {
              e.preventDefault();
              setImage((current) => ({
                ...current,
                index:
                  (current.index +
                    (e.key === "ArrowRight" ? 1 : -1) +
                    current.sources.length) %
                  current.sources.length,
              }));
            }
          }}
        >
          <button autoFocus aria-label="ปิดภาพ" onClick={() => setImage("")}>
            <X />
          </button>
          {typeof image === "object" && image.sources.length > 1 && (
            <button
              className="lightbox-prev"
              aria-label="รูปก่อนหน้า"
              onClick={(e) => {
                e.stopPropagation();
                setImage((current) => ({
                  ...current,
                  index:
                    (current.index - 1 + current.sources.length) %
                    current.sources.length,
                }));
              }}
            >
              <ArrowLeft />
            </button>
          )}
          <img
            src={typeof image === "string" ? image : image.sources[image.index]}
            alt="ภาพขยาย"
            onClick={(e) => e.stopPropagation()}
          />
          {typeof image === "object" && image.sources.length > 1 && (
            <>
              <button
                className="lightbox-next"
                aria-label="รูปถัดไป"
                onClick={(e) => {
                  e.stopPropagation();
                  setImage((current) => ({
                    ...current,
                    index: (current.index + 1) % current.sources.length,
                  }));
                }}
              >
                <ArrowRight />
              </button>
              <span className="lightbox-count">
                {image.index + 1}/{image.sources.length}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
