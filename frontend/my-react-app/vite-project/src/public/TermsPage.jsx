// frontend/src/public/TermsPage.jsx
import React from 'react';
import {
  Scale,
  Ban,
  ShieldAlert,
  Lock,
  KeyRound,
  CheckCircle2,
  ListChecks,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import PublicLayout, { IconList, FeatureSection } from './PublicLayout';

const USER_COMMITMENTS = [
  { icon: Scale, text: 'Utilizzare il servizio nel rispetto delle leggi applicabili' },
  { icon: Ban, text: 'Non diffondere contenuti illeciti, fraudolenti, offensivi o dannosi' },
  { icon: ShieldAlert, text: 'Non compromettere il corretto funzionamento della piattaforma' },
  { icon: Lock, text: "Non tentare di accedere senza autorizzazione agli account o ai dati di altri utenti" },
  { icon: KeyRound, text: 'Mantenere riservate le proprie credenziali di accesso' },
  { icon: CheckCircle2, text: 'Utilizzare il servizio in modo responsabile' },
];

export default function TermsPage() {
  return (
    <PublicLayout>
      <h1>Le regole chiare di un servizio che non nasconde nulla.</h1>
      <p>L'utilizzo della piattaforma comporta l'accettazione dei presenti Termini di utilizzo.</p>

      <FeatureSection icon={ListChecks} title="L'utente si impegna a">
        <IconList items={USER_COMMITMENTS} />
      </FeatureSection>

      <FeatureSection icon={AlertTriangle} title="Limitazioni e sospensioni" accent="rose">
        <p>
          Ci riserviamo la facoltà di limitare, sospendere o chiudere gli
          account che violino i presenti termini o che compromettano la
          sicurezza e l'integrità del servizio.
        </p>
      </FeatureSection>

      <FeatureSection icon={FileText} title="Aggiornamenti dei termini" accent="bronze">
        <p>
          I presenti Termini potranno essere aggiornati nel tempo. Le
          eventuali modifiche saranno pubblicate su questa pagina.
        </p>
      </FeatureSection>
    </PublicLayout>
  );
}