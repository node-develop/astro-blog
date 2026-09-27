import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { parseNum } from "../lib/format";

/* ── Segmented control: single choice, arrow keys move and select ───── */

export interface SegOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

export const Segmented = <T extends string | number>({
  label,
  options,
  value,
  onChange,
  full = false,
}: {
  readonly label: string;
  readonly options: readonly SegOption<T>[];
  readonly value: T;
  readonly onChange: (v: T) => void;
  readonly full?: boolean;
}) => {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const i = enabled.findIndex((o) => o.value === value);
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  };
  return (
    <div className={`seg${full ? "seg--full" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-disabled={o.disabled || undefined}
          tabIndex={o.value === value ? 0 : -1}
          className="seg__opt"
          onClick={() => !o.disabled && onChange(o.value)}
          onKeyDown={onKey}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

/* ── Filter chip: a toggle ─────────────────────────────────────────── */

export const Chip = ({
  pressed,
  onClick,
  children,
  label,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly label?: string;
}) => (
  <button
    type="button"
    className="chip"
    aria-pressed={pressed}
    aria-label={label}
    onClick={onClick}
  >
    {children}
  </button>
);

export type Tone = "warning" | "danger" | "info" | "success";
export const StatusChip = ({
  tone,
  children,
}: {
  readonly tone: Tone;
  readonly children: ReactNode;
}) => <span className={`status status--${tone}`}>{children}</span>;

/* ── Number field: keeps its own text while typing, reports valid numbers ── */

export const NumberField = ({
  id,
  label,
  value,
  onChange,
  min,
  max,
  prefix,
  suffix,
  hint,
  error,
  warning,
  disabled = false,
  compact = false,
  hideLabel = false,
  step,
}: {
  readonly id?: string;
  readonly label: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly min?: number;
  readonly max?: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly hint?: ReactNode;
  readonly error?: string;
  readonly warning?: string | null;
  readonly disabled?: boolean;
  readonly compact?: boolean;
  readonly hideLabel?: boolean;
  readonly step?: number;
}) => {
  const autoId = useId();
  const fid = id ?? autoId;
  const fmt = (v: number) =>
    Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace(".", ",") : "";
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(fmt(value));
      setBad(false);
    }
  }, [value]);

  const commit = (raw: string) => {
    const v = parseNum(raw);
    const ok = v != null && (min == null || v >= min) && (max == null || v <= max);
    setBad(!ok);
    if (ok && v !== value) onChange(v);
  };

  const describedBy = bad || hint || warning ? `${fid}-msg` : undefined;
  return (
    <div className={`field${compact ? "field--compact" : ""}${disabled ? "field--disabled" : ""}`}>
      <label htmlFor={fid} className={hideLabel ? "sr-only" : "field__label"}>
        {label}
      </label>
      <div className={`field__box${bad ? "field__box--error" : ""}`}>
        {prefix && <span className="field__affix">{prefix}</span>}
        <input
          id={fid}
          className="field__input"
          inputMode="decimal"
          value={text}
          disabled={disabled}
          step={step}
          aria-invalid={bad || undefined}
          aria-describedby={describedBy}
          onFocus={() => {
            focused.current = true;
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onBlur={() => {
            focused.current = false;
            if (!bad) setText(fmt(value));
          }}
        />
        {suffix && <span className="field__affix">{suffix}</span>}
      </div>
      {(bad || hint || warning) && (
        <p
          id={`${fid}-msg`}
          className={`field__msg${bad ? "field__msg--error" : warning ? "field__msg--warn" : ""}`}
        >
          {bad ? (error ?? "") : (warning ?? hint)}
        </p>
      )}
    </div>
  );
};

/* ── Slider paired with a number field (economy tab) ───────────────── */

export const SliderField = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  hint,
  warning,
  error,
  disabled = false,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly hint?: ReactNode;
  readonly warning?: string | null;
  readonly error?: string;
  readonly disabled?: boolean;
}) => {
  const id = useId();
  const clamped = Math.min(max, Math.max(min, value));
  return (
    <div className={`slider${disabled ? "slider--disabled" : ""}`}>
      <div className="slider__row">
        <input
          type="range"
          className="slider__range"
          aria-label={label}
          aria-describedby={`${id}-f`}
          min={min}
          max={max}
          step={step}
          value={clamped}
          disabled={disabled}
          style={{ ["--fill" as string]: `${((clamped - min) / (max - min)) * 100}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <NumberField
          id={`${id}-f`}
          label={label}
          value={value}
          onChange={onChange}
          min={0}
          {...(prefix ? { prefix } : {})}
          {...(suffix ? { suffix } : {})}
          {...(error ? { error } : {})}
          disabled={disabled}
          compact
          hideLabel
        />
      </div>
      <p className="slider__label">{label}</p>
      {(warning || hint) && (
        <p className={`field__msg${warning ? "field__msg--warn" : ""}`}>{warning ?? hint}</p>
      )}
    </div>
  );
};

/* ── Toggletip: click or Enter opens, Esc closes ───────────────────── */

export const InfoTip = ({ text, label }: { readonly text: string; readonly label: string }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | globalThis.KeyboardEvent) => {
      if (
        e instanceof globalThis.KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span className="tip" ref={ref}>
      <button
        type="button"
        className="tip__btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <rect x="7.2" y="7" width="1.6" height="5" fill="currentColor" />
          <rect x="7.2" y="4" width="1.6" height="1.6" fill="currentColor" />
        </svg>
      </button>
      <span className="tip__bubble" role="status" hidden={!open}>
        {open ? text : ""}
      </span>
    </span>
  );
};

export const PriceTier = ({ tier }: { readonly tier: number }) => (
  <span className="tier" aria-label={"$".repeat(tier)}>
    {[1, 2, 3, 4].map((i) => (
      <span
        key={i}
        className={`tier__cell${i <= tier ? "tier__cell--on" : ""}`}
        aria-hidden="true"
      />
    ))}
  </span>
);

/** 10x10 grid of people; `pct` of them filled. 0.1% fills a tenth of one square. */
export const PeopleGrid = ({ pct }: { readonly pct: number }) => {
  const full = Math.floor(pct);
  const part = pct - full;
  return (
    <span className="people" aria-hidden="true">
      {Array.from({ length: 100 }, (_, i) => (
        <span
          key={i}
          className={`people__cell${i < full ? "people__cell--on" : ""}`}
          style={
            i === full && part > 0
              ? { ["--part" as string]: `${Math.max(part * 100, 18)}%` }
              : undefined
          }
          data-part={i === full && part > 0 ? "" : undefined}
        />
      ))}
    </span>
  );
};
