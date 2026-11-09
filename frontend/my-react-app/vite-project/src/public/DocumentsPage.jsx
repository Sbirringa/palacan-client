// frontend/src/public/DocumentsPage.jsx  [palacan-v4b]
//
// Pagina "Documenti": l'UNICO posto del sito con i PDF da scaricare. Le altre pagine non linkano i PDF uno per uno,
// rimandano tutte qui (RiquadroDocumentazione). I PDF sono solo in inglese e sono generati dai documenti pubblici
// su GitHub (docs/*.md, SECURITY.md); l'elenco e' DOCUMENTI in testiPagine.js (tests/v4bDocumenti.test.js).
import React from 'react';
import { FileText, Download, BookOpen, Network, ShieldCheck, Flag, Info, ArrowUpRight } from 'lucide-react';
import PublicLayout from './PublicLayout';
import { useTestiPagine, DOCUMENTI, DATA_DOCUMENTI, suGitHub } from './testiPagine';

const ICONE = { whitepaper: BookOpen, protocol: FileText, architecture: Network, verification: ShieldCheck, policy: Flag };

function dataLeggibile(locale) {
  const [a, m, g] = DATA_DOCUMENTI.split('-').map(Number);
  try {
    return new Date(Date.UTC(a, m - 1, g)).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return DATA_DOCUMENTI;
  }
}

function Documento({ doc, testo, d, principale = false }) {
  const Icona = ICONE[doc.key] || FileText;
  return (
    <div className={`rounded-2xl border bg-white p-6 ${principale ? 'border-[#0F766E]/40 shadow-sm' : 'border-[#E4E4E7]'}`}>
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F766E]/10">
          <Icona size={20} className="text-[#0F766E]" />
        </span>
        <div className="min-w-0 flex-1">
          {principale && (
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#0F766E]">{d.featured}</p>
          )}
          <p className="text-base font-semibold text-[#1A1A1A]">{testo.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#4B5563]">{testo.description}</p>
          <p className="mt-2 text-xs text-[#6B7280]">
            PDF · {doc.pagine} {d.pages} · {doc.kb} KB · {d.english}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={doc.file}
              download
              className="inline-flex items-center gap-2 rounded-full bg-[#0F766E] px-5 py-1.5 text-sm font-semibold text-white hover:bg-[#0B5A54] transition-colors duration-200"
            >
              <Download size={15} />
              {d.download}
            </a>
            <span className="text-sm text-[#6B7280]">
              {d.source}:{' '}
              {doc.fonti.map((f, i) => (
                <React.Fragment key={f}>
                  {i > 0 ? ' · ' : null}
                  <a
                    href={suGitHub(f)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 whitespace-nowrap font-medium text-[#0B5A54] underline decoration-[#0F766E]/30 underline-offset-2 hover:decoration-[#0F766E]"
                  >
                    {f.split('/').pop()}
                    <ArrowUpRight size={12} />
                  </a>
                </React.Fragment>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const t = useTestiPagine();
  const d = t.documents;
  const [primo, ...altri] = DOCUMENTI;
  return (
    <PublicLayout>
      <h1>{d.title}</h1>
      <p>{d.intro}</p>
      <p className="text-sm text-[#6B7280]">{`${d.version} ${dataLeggibile(d.locale)}`}</p>
      <div className="not-prose mt-8 space-y-4">
        <Documento doc={primo} testo={d.items[primo.key]} d={d} principale />
        <p className="pt-4 text-sm font-semibold text-[#1A1A1A]">{d.parts}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {altri.map((doc) => <Documento key={doc.key} doc={doc} testo={d.items[doc.key]} d={d} />)}
        </div>
      </div>
      <div className="not-prose mt-10 rounded-2xl border border-[#E4E4E7] bg-[#F2F2F3]/40 p-6">
        <div className="flex items-start gap-3">
          <Info size={18} className="mt-0.5 shrink-0 text-[#0F766E]" />
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">{d.originTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#4B5563]">{d.origin}</p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
