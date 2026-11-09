// frontend/src/public/SecurityPage.jsx  [palacan-v4] testi in 5 lingue (testiPagine.js), allineati a docs/ su GitHub
import React from 'react';
import {
  Lock, KeyRound, Save, ShieldCheck, EyeOff, Activity, Check, X, Smartphone, Server, ArrowRight, ArrowDown,
  Globe, FileText, Users, Eye,
} from 'lucide-react';
import PublicLayout, { FeatureSection } from './PublicLayout';
import { useTestiPagine } from './testiPagine';
import { Sezione, RiquadroDocumentazione } from './SezioniPubbliche';

const ICONE = { e2ee: Lock, olm: KeyRound, pq: ShieldCheck, verify: Users, keys: Save, infra: Globe, proofs: FileText, limits: Eye, report: Activity };

function Freccia() {
  return (
    <div className="flex items-center justify-center py-1 md:px-1">
      <ArrowRight className="hidden text-[#9CA3AF] md:block" size={20} />
      <ArrowDown className="text-[#9CA3AF] md:hidden" size={20} />
    </div>
  );
}

// classi intere e scritte per esteso: Tailwind genera solo quelle che trova cosi' nel codice
const COLORI = {
  mittente: ['bg-[#0F766E]/10', 'text-[#0F766E]'],
  server: ['bg-[#155E75]/10', 'text-[#155E75]'],
  destinatario: ['bg-[#7A8F73]/10', 'text-[#7A8F73]'],
};

function Riquadro({ icon: Icon, colore, titolo, righe, evidenzia = false }) {
  const [sfondo, testo] = COLORI[colore];
  return (
    <div className="flex-1 rounded-xl border border-[#E4E4E7] bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${sfondo}`}>
          <Icon size={16} className={testo} />
        </span>
        <span className="text-sm font-semibold text-[#1A1A1A]">{titolo}</span>
      </div>
      <ul className="space-y-1.5 text-xs leading-relaxed text-[#6B7280]">
        {righe.map((r, i) => <li key={i} className={evidenzia && i === righe.length - 1 ? 'text-[#B85C4A]' : undefined}>{r}</li>)}
      </ul>
    </div>
  );
}

function Flusso({ flow }) {
  return (
    <div className="not-prose mt-6 rounded-2xl border border-[#E4E4E7] bg-[#F2F2F3]/40 p-6">
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        <Riquadro icon={Smartphone} colore="mittente" titolo={flow.sender} righe={flow.senderLines} />
        <Freccia />
        <Riquadro icon={Server} colore="server" titolo={flow.server} righe={flow.serverLines} evidenzia />
        <Freccia />
        <Riquadro icon={Smartphone} colore="destinatario" titolo={flow.recipient} righe={flow.recipientLines} />
      </div>
    </div>
  );
}

function Aziende({ c }) {
  return (
    <FeatureSection icon={EyeOff} title={c.title}>
      {c.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      <div className="not-prose mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-5">
          <p className="mb-3 text-sm font-semibold text-[#1A1A1A]">{c.canTitle}</p>
          <ul className="space-y-2.5 text-sm text-[#4B5563]">
            {c.can.map((v, i) => (
              <li key={i} className="flex items-center gap-2"><Check size={14} className="text-[#7A8F73] shrink-0" />{v}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-5">
          <p className="mb-3 text-sm font-semibold text-[#1A1A1A]">{c.cannotTitle}</p>
          <ul className="space-y-2.5 text-sm text-[#4B5563]">
            {c.cannot.map((v, i) => (
              <li key={i} className="flex items-center gap-2"><X size={14} className="text-[#B85C4A] shrink-0" />{v}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-6">{c.after}</p>
    </FeatureSection>
  );
}

export default function SecurityPage() {
  const t = useTestiPagine();
  const s = t.security;
  return (
    <PublicLayout>
      <h1>{s.title}</h1>
      <p>{s.intro}</p>
      <RiquadroDocumentazione comuni={t.common} />
      {s.sections.map((sezione) => (
        <React.Fragment key={sezione.key}>
          <Sezione icon={ICONE[sezione.key]} sezione={sezione}>
            {sezione.key === 'e2ee' ? <Flusso flow={t.common.flow} /> : null}
          </Sezione>
          {sezione.key === 'keys' ? <Aziende c={s.company} /> : null}
        </React.Fragment>
      ))}
    </PublicLayout>
  );
}