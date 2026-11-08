// frontend/src/public/TechnologyPage.jsx
import React from 'react';
import { Lock, KeyRound, Save, Radio, ShieldCheck, Eye, RefreshCw, FileText, Download,
} from 'lucide-react';
import PublicLayout, { IconList, FeatureSection } from './PublicLayout';

const SERVER_VISIBLE_DATA = [
  { icon: Eye, text: 'Identificativi degli account' },
  { icon: Eye, text: 'Dispositivi associati' },
  { icon: Eye, text: 'Stanze di conversazione' },
  { icon: Eye, text: 'Metadati tecnici indispensabili alla consegna dei messaggi' },
  { icon: Eye, text: 'Dati necessari alla sincronizzazione dei dispositivi' },
];

export default function TechnologyPage() {
  return (
    <PublicLayout>
      <h1>Un'architettura pensata perché il server non possa leggere.</h1>
      <p>
        La piattaforma è progettata secondo un'architettura orientata alla
        sicurezza e alla protezione della privacy degli utenti.
      </p>

      <div className="not-prose mb-4 rounded-2xl border border-[#E4E4E7] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#155E75]/10">
              <FileText size={20} className="text-[#155E75]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A]">Architettura Tecnica — documento tecnico</p>
              <p className="text-sm text-[#6B7280]">Stack, livello dati, scalabilità. In PDF, per chi vuole approfondire.</p>
            </div>
          </div>
          <a
            href="/whitepapers/palacan-technology-whitepaper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#155E75]/35 bg-[#155E75]/[0.06] px-5 py-2 text-sm font-semibold text-[#155E75] hover:bg-[#155E75]/[0.12] transition-colors duration-200"
          >
            <Download size={15} />
            Scarica il PDF
          </a>
        </div>
      </div>

      <FeatureSection icon={Lock} title="Crittografia end-to-end">
        <p>
          Le conversazioni sono protette mediante crittografia end-to-end
          (E2EE). Ogni messaggio viene cifrato direttamente sul dispositivo
          del mittente prima della trasmissione e può essere decifrato
          esclusivamente dai dispositivi autorizzati dei destinatari.
        </p>
        <p>
          Il server gestisce esclusivamente il trasporto, la sincronizzazione
          e l'archiviazione dei dati cifrati, senza disporre delle
          informazioni necessarie per leggerne il contenuto.
        </p>
      </FeatureSection>

      <FeatureSection icon={KeyRound} title="Gestione delle chiavi" accent="blue">
        <p>
          La piattaforma genera e gestisce automaticamente le chiavi
          crittografiche necessarie a proteggere le comunicazioni tra gli
          utenti.
        </p>
        <p>
          Ogni dispositivo autorizzato possiede le proprie chiavi e partecipa
          in modo sicuro allo scambio delle informazioni crittografiche
          necessarie all'avvio delle conversazioni.
        </p>
      </FeatureSection>

      <FeatureSection icon={Save} title="Backup cifrato delle chiavi" accent="bronze">
        <p>
          Per facilitare il ripristino dell'accesso alle conversazioni da
          nuovi dispositivi, la piattaforma supporta il backup cifrato delle
          chiavi crittografiche.
        </p>
        <p>
          Il backup viene cifrato localmente mediante una passphrase scelta
          dall'utente. La passphrase non viene memorizzata dal server e non
          può essere recuperata in caso di smarrimento.
        </p>
      </FeatureSection>

      <FeatureSection icon={Radio} title="Comunicazioni in tempo reale" accent="rose">
        <p>
          Le conversazioni utilizzano connessioni persistenti per consentire
          la consegna dei messaggi e degli eventi in tempo reale, mantenendo
          la sincronizzazione tra i dispositivi autorizzati.
        </p>
      </FeatureSection>

      <FeatureSection icon={ShieldCheck} title="Autenticazione" accent="sage">
        <p>
          L'accesso alla piattaforma avviene mediante autenticazione sicura
          con gestione delle sessioni e verifica delle credenziali. I token
          di autenticazione consentono di mantenere una sessione protetta
          senza esporre le credenziali dell'utente durante l'utilizzo del
          servizio.
        </p>
      </FeatureSection>

      <FeatureSection icon={Eye} title="Cosa può vedere il server" accent="blue">
        <p>Il server può gestire esclusivamente le informazioni necessarie al funzionamento del servizio:</p>
        <IconList items={SERVER_VISIBLE_DATA} />
        <p className="mt-6">
          Il server non dispone delle chiavi necessarie per leggere il
          contenuto delle conversazioni protette dalla crittografia
          end-to-end.
        </p>
      </FeatureSection>

      <FeatureSection icon={RefreshCw} title="Evoluzione della piattaforma">
        <p>
          La sicurezza è un processo continuo. La piattaforma viene
          costantemente aggiornata per introdurre miglioramenti, nuove
          funzionalità e aggiornamenti di sicurezza, mantenendo elevati
          standard di affidabilità e protezione dei dati.
        </p>
      </FeatureSection>
    </PublicLayout>
  );
}
