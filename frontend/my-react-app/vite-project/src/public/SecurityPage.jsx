// frontend/src/public/SecurityPage.jsx
import React from 'react';
import {
  Lock, KeyRound, Save, ShieldCheck, EyeOff, Activity,
  Check, X, Smartphone, Server, ArrowRight, ArrowDown,
  Globe, Clock, Hash, RefreshCw, FileText, Download,
} from 'lucide-react';
import PublicLayout, { IconList, FeatureSection } from './PublicLayout';

const INFRASTRUCTURE_MEASURES = [
  { icon: Globe, text: 'Ogni connessione tra il tuo dispositivo e il server passa attraverso HTTPS/TLS, senza eccezioni.' },
  { icon: Clock, text: 'Le sessioni hanno una scadenza e puoi revocarle in ogni momento, da qualsiasi dispositivo.' },
  { icon: Hash, text: 'La tua password non è mai leggibile: conserviamo solo un hash, mai il testo originale.' },
  { icon: RefreshCw, text: 'Componenti e dipendenze vengono monitorate e aggiornate con regolarità, non una tantum.' },
];

export default function SecurityPage() {
  return (
    <PublicLayout>
      <h1>La sicurezza non è una funzione.<br />È il principio.</h1>
      <p>
        Palacan nasce con un obiettivo preciso: proteggere le comunicazioni
        senza chiedere a nessuno di fidarsi ciecamente. Non basta dire che
        un servizio è sicuro — bisogna costruirlo in modo che la sicurezza
        non dipenda da una promessa, ma da come funziona davvero
        l'architettura.
      </p>

      <div className="not-prose mb-4 rounded-2xl border border-[#E4E4E7] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0F766E]/10">
              <FileText size={20} className="text-[#0F766E]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#1A1A1A]">Architettura di Sicurezza — documento tecnico</p>
              <p className="text-sm text-[#6B7280]">Threat model, protocolli, gestione delle chiavi. In PDF, per chi vuole approfondire.</p>
            </div>
          </div>
          <a
            href="/whitepapers/palacan-security-whitepaper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#0F766E]/35 bg-[#0F766E]/[0.06] px-5 py-2 text-sm font-semibold text-[#0F766E] hover:bg-[#0F766E]/[0.12] transition-colors duration-200"
          >
            <Download size={15} />
            Scarica il PDF
          </a>
        </div>
      </div>

      <FeatureSection icon={Lock} title="Crittografia end-to-end">
        <p>
          Ogni messaggio viene cifrato direttamente sul dispositivo del
          mittente e può essere decifrato solo dai dispositivi autorizzati
          dei destinatari. Il server si occupa esclusivamente di trasporto e
          sincronizzazione: non possiede le chiavi necessarie per leggere il
          contenuto.
        </p>

        <div className="not-prose mt-6 rounded-2xl border border-[#E4E4E7] bg-[#F2F2F3]/40 p-6">
          <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">

            <div className="flex-1 rounded-xl border border-[#E4E4E7] bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0F766E]/10">
                  <Smartphone size={16} className="text-[#0F766E]" />
                </span>
                <span className="text-sm font-semibold text-[#1A1A1A]">Dispositivo mittente</span>
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-[#6B7280]">
                <li>Scrivi il messaggio</li>
                <li>Viene cifrato prima di partire</li>
              </ul>
            </div>

            <div className="flex items-center justify-center py-1 md:px-1">
              <ArrowRight className="hidden text-[#9CA3AF] md:block" size={20} />
              <ArrowDown className="text-[#9CA3AF] md:hidden" size={20} />
            </div>

            <div className="flex-1 rounded-xl border border-[#E4E4E7] bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#155E75]/10">
                  <Server size={16} className="text-[#155E75]" />
                </span>
                <span className="text-sm font-semibold text-[#1A1A1A]">Server</span>
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-[#6B7280]">
                <li>Instrada il messaggio cifrato</li>
                <li className="text-[#B85C4A]">Non può leggerlo: non ha le chiavi</li>
              </ul>
            </div>

            <div className="flex items-center justify-center py-1 md:px-1">
              <ArrowRight className="hidden text-[#9CA3AF] md:block" size={20} />
              <ArrowDown className="text-[#9CA3AF] md:hidden" size={20} />
            </div>

            <div className="flex-1 rounded-xl border border-[#E4E4E7] bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7A8F73]/10">
                  <Smartphone size={16} className="text-[#7A8F73]" />
                </span>
                <span className="text-sm font-semibold text-[#1A1A1A]">Dispositivo destinatario</span>
              </div>
              <ul className="space-y-1.5 text-xs leading-relaxed text-[#6B7280]">
                <li>Arriva ancora cifrato</li>
                <li>Solo lui può decifrarlo</li>
              </ul>
            </div>

          </div>
        </div>
      </FeatureSection>

      <FeatureSection icon={KeyRound} title="Protocollo Olm e Megolm" accent="blue">
        <p>
          Per le conversazioni tra due persone usiamo Olm, un protocollo che
          rinnova continuamente le proprie chiavi: anche se qualcuno
          riuscisse a comprometterne una, le conversazioni passate
          resterebbero comunque al sicuro. Per i gruppi usiamo Megolm, che
          fa lo stesso lavoro ma pensato per restare efficiente anche con
          molti partecipanti.
        </p>
        <p>
          Non abbiamo inventato un sistema tutto nostro: abbiamo scelto
          protocolli già studiati, testati e messi alla prova da anni dalla
          comunità della sicurezza. È una scelta di prudenza, non di
          comodità — la sicurezza vera si dimostra, non si dichiara.
        </p>
      </FeatureSection>

      <FeatureSection icon={Save} title="Gestione delle chiavi" accent="sage">
        <p>
          Le tue chiavi di cifratura vivono solo sul tuo dispositivo: non le
          inviamo mai al server, e senza di esse nessuno può leggere i tuoi
          messaggi — nemmeno noi.
        </p>
        <p>
          Se cambi dispositivo, puoi comunque recuperare l'accesso grazie a
          un backup cifrato protetto da una passphrase che scegli tu.
          Rimane sotto il tuo controllo esclusivo: ne parliamo più nel
          dettaglio nella pagina Privacy.
        </p>
      </FeatureSection>

      <FeatureSection icon={ShieldCheck} title="Sicurezza dell'infrastruttura" accent="rose">
        <IconList items={INFRASTRUCTURE_MEASURES} />
      </FeatureSection>

      <FeatureSection icon={EyeOff} title="Architettura zero-access" accent="bronze">
        <p>
          Se usi Palacan da privato, questa sezione riguarda un problema che
          per te semplicemente non esiste: non c'è nessun amministratore
          che gestisce il tuo account, quindi nessuno ha nemmeno la
          possibilità di vedere qualcosa. Se invece lo usi nel nome di
          un'organizzazione, un amministratore c'è davvero — ma la garanzia
          resta identica: amministrare un'organizzazione e leggere le
          conversazioni dei suoi membri sono due cose diverse, separate per
          progettazione, non per promessa.
        </p>

        <div className="not-prose mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5">
            <p className="mb-3 text-sm font-semibold text-[#1A1A1A]">Un amministratore può</p>
            <ul className="space-y-2.5 text-sm text-[#4B5563]">
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#7A8F73] shrink-0" />
                Gestire utenti e dispositivi del workspace
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#7A8F73] shrink-0" />
                Assegnare ruoli e permessi
              </li>
              <li className="flex items-center gap-2">
                <Check size={14} className="text-[#7A8F73] shrink-0" />
                Configurare policy di sicurezza
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5">
            <p className="mb-3 text-sm font-semibold text-[#1A1A1A]">Un amministratore non può</p>
            <ul className="space-y-2.5 text-sm text-[#4B5563]">
              <li className="flex items-center gap-2">
                <X size={14} className="text-[#B85C4A] shrink-0" />
                Leggere il contenuto delle conversazioni
              </li>
              <li className="flex items-center gap-2">
                <X size={14} className="text-[#B85C4A] shrink-0" />
                Accedere ai messaggi cifrati
              </li>
              <li className="flex items-center gap-2">
                <X size={14} className="text-[#B85C4A] shrink-0" />
                Recuperare chiavi o passphrase degli utenti
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-6">
          Non è una regola scritta da rispettare: è una porta che non esiste.
          Le chiavi private non sono disponibili sul server, quindi anche
          volendo un amministratore non avrebbe modo di aprire una
          conversazione che non gli appartiene.
        </p>
      </FeatureSection>

      <FeatureSection icon={Activity} title="Un processo continuo">
        <p>
          Nessun sistema resta sicuro da solo. Ogni giorno nascono nuove
          minacce e vengono scoperte nuove vulnerabilità, e Palacan cresce
          insieme a questo scenario: aggiorniamo le componenti della
          piattaforma, monitoriamo le dipendenze e introduciamo nuove
          protezioni man mano che servono. La sicurezza qui non è un
          traguardo raggiunto una volta — è un impegno che rinnoviamo a
          ogni versione.
        </p>
      </FeatureSection>
    </PublicLayout>
  );
}
