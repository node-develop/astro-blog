import { useId, useState, type FormEvent } from "react";
import { track } from "../lib/analytics";
import { t } from "../lib/i18n";
import { encodeState } from "../lib/state";
import type { CalcState, Lang } from "../lib/types";

const EMAIL = "a@artka.dev";
type Status = "idle" | "sending" | "sent" | "error";

export const FeedbackForm = ({ lang, state }: { readonly lang: Lang; readonly state: CalcState }) => {
  const id = useId();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState(true);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = message.trim();
    if (text.length < 3) {
      setProblem(t(lang, "fb.tooShort"));
      return;
    }
    if (text.length > 3000) {
      setProblem(t(lang, "fb.tooLong"));
      return;
    }
    setProblem(null);
    setStatus("sending");
    const url = new URL(location.href);
    url.searchParams.set("s", encodeState(state));
    try {
      // Relative URL: works at the site root and under /avatar-calculator/.
      const r = await fetch("./api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          contact,
          message: text,
          link: attach ? url.toString() : "",
          lang,
          website,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setStatus("sent");
      setMessage("");
      track("send_feedback", { attached: attach });
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="feedback" aria-labelledby={`${id}-title`}>
      <div className="section-head">
        <h2 id={`${id}-title`} className="h2">
          {t(lang, "fb.title")}
        </h2>
        <p className="section-sub">{t(lang, "fb.sub")}</p>
      </div>
      {status === "sent" ? (
        <p className="feedback__done" role="status">
          {t(lang, "fb.sent")}
        </p>
      ) : (
        <form className="feedback__form" onSubmit={submit} noValidate>
          <div className="feedback__row">
            <label className="field">
              <span className="field__label">
                {t(lang, "fb.name")} <span className="note">{t(lang, "fb.optional")}</span>
              </span>
              <input
                className="search"
                value={name}
                maxLength={100}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">
                {t(lang, "fb.contact")} <span className="note">{t(lang, "fb.optional")}</span>
              </span>
              <input
                className="search"
                value={contact}
                maxLength={200}
                autoComplete="email"
                onChange={(e) => setContact(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span className="field__label">{t(lang, "fb.message")}</span>
            <textarea
              className="feedback__text"
              value={message}
              maxLength={3000}
              rows={5}
              required
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${id}-err` : undefined}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          {problem && (
            <p id={`${id}-err`} className="field__msg field__msg--error">
              {problem}
            </p>
          )}
          {/* Honeypot: hidden from people, bots fill it and get silently dropped. */}
          <input
            className="feedback__hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <label className="check">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            <span>{t(lang, "fb.attach")}</span>
          </label>
          <div className="feedback__actions">
            <button type="submit" className="btn btn--primary" disabled={status === "sending"}>
              {status === "sending" ? t(lang, "fb.sending") : t(lang, "fb.send")}
            </button>
            {status === "error" && (
              <p className="field__msg field__msg--error" role="alert">
                {t(lang, "fb.error", { email: EMAIL })}
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
};
