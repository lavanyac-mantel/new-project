import { useState, useEffect, useRef } from 'react';

export default function SearchBox() {
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);
  const [open, setOpen]               = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const timerRef = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/autocomplete?q=${encodeURIComponent(query)}&limit=8`);
        if (!res.ok) return;
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        // API unreachable — fail silently
      }
    }, 120);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  function select(title) {
    setQuery(title);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      select(results[activeIndex].title);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-full max-w-xl">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search services or ask a question..."
          autoComplete="off"
          spellCheck="false"
          className="w-full rounded-lg border-2 border-gray-300 focus:border-nsw-blue
                     outline-none pl-4 pr-10 py-3 text-base bg-white shadow-sm
                     transition-colors"
        />
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          width="18" height="18" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200
                       rounded-lg shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <li
              key={r.id}
              onMouseDown={() => select(r.title)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-0
                ${i === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <p className="text-sm font-medium text-gray-900">{r.title}</p>
              {r.section && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{r.section}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200
                        rounded-lg shadow-lg px-4 py-3 text-sm text-gray-400">
          No suggestions found
        </div>
      )}
    </div>
  );
}
