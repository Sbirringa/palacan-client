// frontend/src/public/OpenSourcePage.jsx  [palacan-v4] testi in 5 lingue (testiPagine.js); codice PUBBLICO e
// verificabile, ma non "open source": la licenza permette di leggere, compilare e verificare, non di riutilizzare.
import React from 'react';
import { Github, FileText, ShieldCheck, Server, Eye, Activity } from 'lucide-react';
import PublicLayout from './PublicLayout';
import { useTestiPagine } from './testiPagine';
import { Sezione, RiquadroDocumentazione, PulsanteRepository } from './SezioniPubbliche';

const ICONE = { what: Github, licence: FileText, build: ShieldCheck, server: Server, checks: Eye, report: Activity };

export default function OpenSourcePage() {
  const t = useTestiPagine();
  const o = t.openSource;
  return (
    <PublicLayout>
      <h1>{o.title}</h1>
      <p>{o.intro}</p>
      <div className="not-prose mt-6 mb-4">
        <PulsanteRepository testo={t.common.github} />
      </div>
      <RiquadroDocumentazione comuni={t.common} />
      {o.sections.map((sezione) => <Sezione key={sezione.key} icon={ICONE[sezione.key]} sezione={sezione} />)}
      <p className="mt-16">{o.outro}</p>
    </PublicLayout>
  );
}