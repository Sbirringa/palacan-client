// src/public/SezioniPubbliche.jsx  [palacan-v4]
//
// Blocchi comuni delle pagine Sicurezza, Codice e Tecnologia: una sezione costruita dai testi (testiPagine.js),
// il riquadro della documentazione e i collegamenti al repository pubblico su GitHub.
import React from 'react';
import { Link } from 'react-router-dom';  // [palacan-v4b]
import { Check, ArrowUpRight, ArrowRight, FileText, Github } from 'lucide-react';
import { FeatureSection, IconList } from './PublicLayout';
import { REPOSITORY_PUBBLICO, suGitHub } from './testiPagine';

const STILE_LINK = 'inline-flex items-center gap-2 rounded-full border border-[#0F766E]/35 bg-[#0F766E]/[0.08] px-5 py-1.5 text-sm font-semibold text-[#0B5A54] hover:bg-[#0F766E]/[0.15] transition-colors duration-200';

export function LinkGitHub({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={STILE_LINK}>
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}

export function PulsanteRepository({ testo }) {
  return (
    <a href={REPOSITORY_PUBBLICO} target="_blank" rel="noopener noreferrer" className={STILE_LINK}>
      <Github size={15} />
      {testo}
      <ArrowUpRight size={14} />
    </a>
  );
}

export function Sezione({ icon, sezione, children = null }) {
  return (
    <FeatureSection icon={icon} title={sezione.title}>
      {(sezione.paragraphs || []).map((p, i) => <p key={i}>{p}</p>)}
      {sezione.items && <IconList items={sezione.items.map((text) => ({ icon: Check, text }))} />}
      {sezione.after && <p className="mt-6">{sezione.after}</p>}
      {children}
      {sezione.link && (
        <div className="mt-6">
          <LinkGitHub href={suGitHub(sezione.link.href)}>{sezione.link.label}</LinkGitHub>
        </div>
      )}
    </FeatureSection>
  );
}

export function RiquadroDocumentazione({ comuni }) {
  return (
    <div className="not-prose mb-4 rounded-2xl border border-[#E4E4E7] bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F766E]/10">
            <FileText size={20} className="text-[#0F766E]" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A]">{comuni.docsTitle}</p>
            <p className="text-sm text-[#6B7280]">{comuni.docsSub}</p>
          </div>
        </div>
        {/* [palacan-v4b] niente PDF sparsi: tutte le pagine rimandano alla pagina Documenti */}
        <Link to="/documenti" className={STILE_LINK}>
          {comuni.docsCta}
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
