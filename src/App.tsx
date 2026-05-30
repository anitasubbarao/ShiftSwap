import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { parseSchedule } from "./lib/swapper/parser";
import {
  findSwapCandidates,
  groupCandidatesByPerson,
  listPeople,
} from "./lib/swapper/finder";
import { assignmentKey } from "./lib/swapper/rules";
import { getShift } from "./lib/swapper/shifts";
import type { Assignment, Schedule } from "./lib/swapper/types";
import {
  openCsv as platformOpenCsv,
  recallAndReopen,
  rememberPath,
} from "./platform";

function fmtRange(a: Assignment): string {
  return `${format(a.startDt, "EEE MMM d, h:mm a")} – ${format(
    a.endDt,
    a.startDt.toDateString() === a.endDt.toDateString()
      ? "h:mm a"
      : "EEE h:mm a",
  )}`;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function NameCombobox({
  people,
  value,
  onChange,
}: {
  people: string[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.toLowerCase().trim();
    if (!q) return people;
    return people.filter((p) => p.toLowerCase().includes(q));
  }, [people, value]);

  useEffect(() => setHighlight(0), [value, open]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function commit(name: string) {
    onChange(name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault();
        commit(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative max-w-md">
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Start typing your name…"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg"
        >
          {filtered.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(name);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={[
                "px-3 py-2 text-sm cursor-pointer",
                i === highlight
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-800 hover:bg-slate-50",
              ].join(" ")}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonalCalendar({
  schedule,
  person,
  candidateDates,
  selectedShiftKey,
  filteredDate,
  onToggleFilteredDate,
  onSelectShift,
}: {
  schedule: Schedule;
  person: string;
  candidateDates: Set<string>;
  selectedShiftKey: string | null;
  filteredDate: string | null;
  onToggleFilteredDate: (date: string) => void;
  onSelectShift: (shift: Assignment) => void;
}) {
  const shiftsByDay = useMemo(() => {
    const m = new Map<number, Assignment[]>();
    for (const a of schedule.assignments) {
      if (a.personName !== person) continue;
      const day = a.startDt.getDate();
      const list = m.get(day);
      if (list) list.push(a);
      else m.set(day, [a]);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.startDt.getTime() - b.startDt.getTime());
    }
    return m;
  }, [schedule, person]);

  const firstOfMonth = new Date(schedule.year, schedule.month - 1, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

  function dateStrOf(day: number): string {
    return `${schedule.year}-${String(schedule.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div className="rounded-md border border-slate-200 overflow-hidden flex flex-col">
      <div className="bg-slate-50 px-4 py-2 text-sm font-medium border-b border-slate-200 flex items-baseline justify-between">
        <span>{person}'s calendar</span>
        <span className="text-xs font-normal text-slate-700">
          {format(firstOfMonth, "MMMM yyyy")}
        </span>
      </div>
      <div className="grid grid-cols-7 text-[10px] font-medium text-center text-slate-700 bg-slate-50/60">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 flex-1">
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - startWeekday + 1;
          const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
          const date = inMonth ? dateStrOf(dayNum) : null;
          const assignments = inMonth ? (shiftsByDay.get(dayNum) ?? []) : [];
          const isCandidateDate = !!(date && candidateDates.has(date));
          const isSelectedDay = assignments.some(
            (a) => assignmentKey(a) === selectedShiftKey,
          );
          const isFiltered = !!(date && filteredDate === date);
          return (
            <div
              key={i}
              onClick={
                isCandidateDate && date
                  ? () => onToggleFilteredDate(date)
                  : undefined
              }
              className={[
                "bg-white min-h-[68px] p-1.5 flex flex-col gap-0.5 text-left",
                isCandidateDate &&
                  "cursor-pointer hover:bg-emerald-50 ring-2 ring-inset ring-emerald-400",
                isFiltered &&
                  "bg-emerald-50 ring-2 ring-inset ring-emerald-600",
                isSelectedDay && "ring-2 ring-inset ring-amber-500",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {inMonth && (
                <>
                  <div className="text-[10px] text-slate-700 font-medium">
                    {dayNum}
                  </div>
                  {assignments.map((a) => {
                    const isSelected =
                      assignmentKey(a) === selectedShiftKey;
                    const swappable =
                      getShift(a.shiftLabel).swapClass !== null;
                    const base =
                      "text-[10px] truncate rounded px-1 py-0.5 text-left block w-full";
                    if (swappable) {
                      return (
                        <button
                          key={assignmentKey(a)}
                          type="button"
                          title={`Click to swap out · ${a.shiftLabel}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectShift(a);
                          }}
                          className={[
                            base,
                            "cursor-pointer",
                            isSelected
                              ? "bg-amber-100 text-amber-900 font-semibold ring-1 ring-amber-500"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                          ].join(" ")}
                        >
                          {a.shiftLabel}
                        </button>
                      );
                    }
                    return (
                      <div
                        key={assignmentKey(a)}
                        title={`Not swappable · ${a.shiftLabel}`}
                        className={[
                          base,
                          "bg-slate-50 text-slate-500 italic",
                        ].join(" ")}
                      >
                        {a.shiftLabel}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-4 py-2 text-[10px] text-slate-700 border-t border-slate-200 flex gap-4 flex-wrap">
        <span>Click any of your shifts to pick it for swap-out.</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-100 ring-2 ring-inset ring-amber-500" />
          Selected
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm ring-2 ring-inset ring-emerald-400" />
          Click green day to filter
        </span>
      </div>
    </div>
  );
}

function App() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [person, setPerson] = useState<string>("");
  const [selectedShiftKey, setSelectedShiftKey] = useState<string | null>(null);
  const [filteredDate, setFilteredDate] = useState<string | null>(null);

  const people = useMemo(
    () => (schedule ? listPeople(schedule) : []),
    [schedule],
  );
  const personIsKnown = !!person && people.includes(person);
  const selectedShift = useMemo(() => {
    if (!schedule || !selectedShiftKey) return undefined;
    return schedule.assignments.find(
      (a) => assignmentKey(a) === selectedShiftKey,
    );
  }, [schedule, selectedShiftKey]);
  const candidates = useMemo(
    () =>
      schedule && selectedShift
        ? findSwapCandidates(selectedShift, schedule)
        : [],
    [schedule, selectedShift],
  );
  const filteredCandidates = useMemo(
    () =>
      filteredDate
        ? candidates.filter((c) => c.candidateShift.date === filteredDate)
        : candidates,
    [candidates, filteredDate],
  );
  const grouped = useMemo(
    () => groupCandidatesByPerson(filteredCandidates),
    [filteredCandidates],
  );
  const candidateDates = useMemo(
    () => new Set(candidates.map((c) => c.candidateShift.date)),
    [candidates],
  );

  function loadFromText(path: string, text: string) {
    const parsed = parseSchedule(text);
    setSchedule(parsed);
    setLoadedPath(path);
    setError(null);
    setPerson("");
    setSelectedShiftKey(null);
  }

  async function openCsv() {
    try {
      const result = await platformOpenCsv();
      if (!result) return;
      loadFromText(result.path, result.text);
      await rememberPath(result.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await recallAndReopen();
        if (!result || cancelled) return;
        loadFromText(result.path, result.text);
      } catch {
        // file moved or deleted; user can open manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedShiftKey(null);
    setFilteredDate(null);
  }, [person]);

  useEffect(() => {
    setFilteredDate(null);
  }, [selectedShiftKey]);

  return (
    <div className="min-h-full text-slate-900">
      <header className="bg-[#32006e] sticky top-0">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">ShiftSwap</h1>
            {schedule ? (
              <p className="text-sm text-white/75">
                {schedule.titleLine} · {people.length} residents ·{" "}
                {schedule.assignments.length} assignments
              </p>
            ) : (
              <p className="text-sm text-white/75">No schedule loaded.</p>
            )}
          </div>
          <button
            onClick={openCsv}
            className="inline-flex items-center rounded-md bg-white text-[#32006e] px-4 py-2 text-sm font-semibold hover:bg-slate-100 transition"
          >
            {schedule ? "Open different schedule…" : "Open schedule…"}
          </button>
        </div>
      </header>

      {error && (
        <div className="max-w-5xl mx-auto px-6 mt-4">
          <div className="rounded-md border border-red-300 bg-red-50 text-red-900 px-4 py-3 text-sm">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {!schedule ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center">
            <p className="text-slate-700">
              Open the monthly schedule to begin.
            </p>
            <p className="text-xs text-slate-700 mt-2">
              Accepts .csv, .xls, or .xlsx — a weekly grid with shift labels in
              the first column.
            </p>
          </div>
        ) : (
          <>
            <section className="space-y-2">
              <label className="block text-sm font-medium">Your name</label>
              <NameCombobox
                people={people}
                value={person}
                onChange={setPerson}
              />
              {person && !people.includes(person) && (
                <p className="text-xs text-amber-700">
                  No resident named "{person}" in this schedule.
                </p>
              )}
            </section>

            {personIsKnown && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <div>
                    {selectedShift ? (
                      <>
                        <h2 className="text-lg font-semibold">
                          Swap candidates ·{" "}
                          {filteredDate
                            ? `${grouped.length} people · ${filteredCandidates.length} shifts on ${format(new Date(filteredDate + "T00:00:00"), "EEE MMM d")}`
                            : `${grouped.length} people · ${candidates.length} shifts`}
                        </h2>
                        <p className="text-xs text-slate-700">
                          You picked{" "}
                          <span className="font-medium">
                            {selectedShift.shiftLabel}
                          </span>{" "}
                          on {fmtRange(selectedShift)}. Click a green day on
                          the calendar to filter to that date.
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-lg font-semibold">
                          Pick a shift to swap out of
                        </h2>
                        <p className="text-xs text-slate-700">
                          Click any of your shifts in the calendar on the
                          right to see who you could swap with. Risk and
                          Clinic shifts are non-swappable.
                        </p>
                      </>
                    )}
                  </div>
                  {filteredDate && (
                    <button
                      onClick={() => setFilteredDate(null)}
                      className="text-xs rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100"
                    >
                      Clear date filter
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  <div>
                    {!selectedShift ? (
                      <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-700">
                        Pick a shift from the calendar to see candidates here.
                      </div>
                    ) : grouped.length === 0 ? (
                      <div className="rounded-md border border-slate-200 p-6 text-center text-sm text-slate-700">
                        No valid swap candidates
                        {filteredDate ? " on this date." : " for this shift."}
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {grouped.map(({ person: candPerson, shifts }) => (
                          <li
                            key={candPerson}
                            className="rounded-md border border-slate-200 overflow-hidden"
                          >
                            <div className="flex items-baseline justify-between bg-slate-50 px-4 py-2 border-b border-slate-200">
                              <span className="font-medium">{candPerson}</span>
                              <span className="text-xs text-slate-700">
                                {shifts.length} shift
                                {shifts.length === 1 ? "" : "s"}
                              </span>
                            </div>
                            <ul className="divide-y divide-slate-100">
                              {shifts.map((s) => (
                                <li
                                  key={assignmentKey(s)}
                                  className="px-4 py-2 text-sm flex items-baseline justify-between gap-4"
                                >
                                  <span>{fmtRange(s)}</span>
                                  <span className="text-slate-700 text-xs">
                                    {s.shiftLabel}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="lg:sticky lg:top-24">
                    <PersonalCalendar
                      schedule={schedule}
                      person={person}
                      candidateDates={candidateDates}
                      selectedShiftKey={selectedShiftKey}
                      filteredDate={filteredDate}
                      onToggleFilteredDate={(date) =>
                        setFilteredDate((prev) =>
                          prev === date ? null : date,
                        )
                      }
                      onSelectShift={(s) =>
                        setSelectedShiftKey(assignmentKey(s))
                      }
                    />
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        <footer className="pt-8 text-xs text-slate-500">
          {loadedPath && <p>Source: {loadedPath}</p>}
        </footer>
      </main>
    </div>
  );
}

export default App;
