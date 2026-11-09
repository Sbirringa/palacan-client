// frontend/src/public/TechnologyPage.jsx  [palacan-v4] testi in 5 lingue (testiPagine.js), allineati a docs/ su GitHub
import React from 'react';
import { Server, KeyRound, Smartphone, Save, ShieldCheck, Eye, RefreshCw } from 'lucide-react';
import PublicLayout from './PublicLayout';
import { useTestiPagine } from './testiPagine';
import { Sezione, RiquadroDocumentazione } from './SezioniPubbliche';

const ICONE = { stack: Server, keys: KeyRound, storage: Smartphone, backup: Save, auth: ShieldCheck, server: Eye, build: RefreshCw };

export default function TechnologyPage() {
  const t = useTestiPagine();
  const g = t.technology;
  return (
    <PublicLayout>
      <h1>{g.title}</h1>
      <p>{g.intro}</p>
      <RiquadroDocumentazione comuni={t.common} />
      {g.sections.map((sezione) => <Sezione key={sezione.key} icon={ICONE[sezione.key]} sezione={sezione} />)}
    </PublicLayout>
  );
}