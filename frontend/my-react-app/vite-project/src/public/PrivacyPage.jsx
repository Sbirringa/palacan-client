// frontend/src/public/PrivacyPage.jsx
import React from 'react';
import {
  UserPlus,
  LogIn,
  MessageSquare,
  Smartphone,
  ShieldCheck,
  Scale,
  Lock,
  UserCog,
  History,
} from 'lucide-react';
import PublicLayout, { IconList, FeatureSection } from './PublicLayout';

const DATA_USAGE = [
  { icon: UserPlus, text: 'Creare e gestire gli account' },
  { icon: LogIn, text: "Consentire l'autenticazione degli utenti" },
  { icon: MessageSquare, text: 'Fornire il servizio di messaggistica' },
  { icon: Smartphone, text: 'Sincronizzare i dispositivi autorizzati' },
  { icon: ShieldCheck, text: 'Garantire sicurezza, affidabilità e continuità del servizio' },
  { icon: Scale, text: 'Adempiere agli obblighi previsti dalla normativa vigente' },
];

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <h1>La privacy non è una promessa.<br />È un'architettura.</h1>
      <p>La tutela della privacy costituisce uno dei valori fondamentali della piattaforma.</p>
      <p>
        Raccogliamo esclusivamente le informazioni necessarie al
        funzionamento del servizio e adottiamo misure tecniche e
        organizzative per proteggerle.
      </p>

      <FeatureSection icon={UserCog} title="Come utilizziamo i dati">
        <p>I dati vengono utilizzati esclusivamente per:</p>
        <IconList items={DATA_USAGE} />
      </FeatureSection>

      <FeatureSection icon={Lock} title="Dati protetti dalla crittografia" accent="bronze">
        <p>
          Le conversazioni protette tramite crittografia end-to-end rimangono
          cifrate durante la trasmissione e l'archiviazione. Il contenuto dei
          messaggi non viene utilizzato per finalità pubblicitarie né venduto
          a terzi.
        </p>
      </FeatureSection>

      <FeatureSection icon={History} title="I tuoi diritti" accent="sage">
        <p>
          Gli utenti possono esercitare i diritti previsti dalla normativa
          applicabile contattando il nostro servizio di assistenza.
        </p>
        <p>
          La presente informativa potrà essere aggiornata nel tempo per
          riflettere l'evoluzione del servizio e delle disposizioni
          normative.
        </p>
      </FeatureSection>
    </PublicLayout>
  );
}