import { useEffect, useState, type FormEvent } from 'react';
import type { AdvisorResponse } from '../data/api/ApiDataProvider';

const PRESET_QUESTIONS = {
  vi: [
    'Tóm tắt điều kiện chiếu sáng Mặt Trời, tầm nhìn Trái Đất và rủi ro vận hành chính.',
    'Chuỗi tối liên tục dài nhất có đáng lo ngại cho pin và sưởi ấm không?',
  ],
  en: [
    'Summarize solar illumination, Earth visibility, and key operational risks for this site.',
    'What do the longest darkness and Earth blackout runs imply for operations?',
  ],
} as const;

export function AdvisorPanel({
  resultId,
  siteName,
  onAsk,
}: {
  resultId: string | undefined;
  siteName: string | undefined;
  onAsk(resultId: string, question: string, language: 'vi' | 'en'): Promise<AdvisorResponse>;
}) {
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [question, setQuestion] = useState<string>(PRESET_QUESTIONS.vi[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AdvisorResponse | null>(null);

  useEffect(() => {
    if (!resultId) {
      setResponse(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void onAsk(resultId, PRESET_QUESTIONS[language][0], language).then(
      (data) => {
        if (active) setResponse(data);
      },
      (reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to reach advisor');
      },
    ).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [resultId, language, onAsk]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!resultId || !question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await onAsk(resultId, question.trim(), language);
      setResponse(data);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Advisor request failed');
    } finally {
      setLoading(false);
    }
  }

  if (!resultId) {
    return (
      <section className="panel advisor-panel">
        <p className="muted">Apply a covered scenario first so the advisor can ground its explanation in an immutable server result ID.</p>
      </section>
    );
  }

  return (
    <section className="panel advisor-panel" aria-busy={loading}>
      <div className="section-heading">
        <div>
          <strong>{siteName ?? 'Analyzed site'}</strong>
          <small>Grounded in immutable result <code>{resultId}</code></small>
        </div>
        <div className="mode-toggle" role="group" aria-label="Advisor language">
          {(['vi', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              aria-pressed={language === lang}
              onClick={() => {
                setLanguage(lang);
                setQuestion(PRESET_QUESTIONS[lang][0]);
              }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="saved-scenario-form">
        <input
          name="advisorQuestion"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
          aria-label="Ask mission advisor"
        />
        <button type="submit" className="primary-button" disabled={loading || !question.trim()}>
          {loading ? 'Analyzing…' : 'Ask advisor'}
        </button>
      </form>

      {error && <p role="alert" className="error-text">{error}</p>}

      {response && (
        <div className="advisor-result">
          <div className="section-heading">
            <span className="tag">
              {response.mode === 'llm'
                ? 'LLM · Grounded'
                : response.mode === 'deterministic_fallback'
                  ? 'Deterministic fallback'
                  : 'Deterministic grounded'}
            </span>
          </div>
          {response.providerUnavailable && response.providerError && (
            <p className="notice">{response.providerError}</p>
          )}
          <p>{response.summary}</p>

          {response.recommendations.length > 0 && (
            <div>
              <h3>Operational notes</h3>
              <ul className="advisor-list">
                {response.recommendations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}

          {response.citations.length > 0 && (
            <div>
              <h3>Cited evidence</h3>
              <dl className="advisor-citations">
                {response.citations.map((c) => (
                  <div key={c.label}>
                    <dt>{c.label}</dt>
                    <dd>{c.value}<small>{c.source}</small></dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {response.limitations.length > 0 && (
            <div>
              <h3>Scope & limitations</h3>
              <ul className="advisor-list muted">
                {response.limitations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
