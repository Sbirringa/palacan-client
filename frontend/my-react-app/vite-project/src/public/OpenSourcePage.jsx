// frontend/src/public/OpenSourcePage.jsx
import React from 'react';
import { Github, ShieldCheck, Users, KeyRound, EyeOff, ArrowUpRight } from 'lucide-react';
import PublicLayout, { FeatureSection, IconList } from './PublicLayout';

const REPO_URL = 'https://github.com/tuo-utente/palacan';

const VERIFIABLE_ITEMS = [
  { icon: ShieldCheck, text: 'La cifratura dei messaggi avviene sul dispositivo, prima della trasmissione.' },
  { icon: ShieldCheck, text: 'Le chiavi private restano sotto il controllo esclusivo dell\'utente.' },
  { icon: ShieldCheck, text: 'Il server non dispone degli strumenti per leggere il contenuto delle conversazioni.' },
  { icon: ShieldCheck, text: 'Nessun meccanismo nascosto che aggiri la protezione crittografica.' },
  { icon: ShieldCheck, text: 'Gli aggiornamenti possono essere analizzati per seguire l\'evoluzione del software nel tempo.' },
  { icon: ShieldCheck, text: 'Nessuna libreria di analytics o tracciamento nascosta nel codice del client.' },
];

function GithubButton() {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="ct-focus inline-flex items-center gap-2 rounded-full border border-[#0F766E]/35 bg-[#0F766E]/[0.08] px-5 py-1.5 text-sm font-semibold text-[#0B5A54] hover:bg-[#0F766E]/[0.15] transition-colors duration-200"
    >
      <Github size={15} />
      Vai al repository su GitHub
      <ArrowUpRight size={14} />
    </a>
  );
}

export default function OpenSourcePage() {
  return (
    <PublicLayout>
      <h1>Aperto per essere verificato, non per essere creduto sulla parola.</h1>
      <p>
        La sicurezza non dovrebbe mai dipendere da una promessa. Quando un
        prodotto gestisce conversazioni private, la fiducia non nasce dalle
        dichiarazioni di chi lo sviluppa — nasce dalla possibilità di
        comprenderne il funzionamento e sottoporlo a un controllo
        indipendente.
      </p>

      <div className="not-prose mt-6">
        <GithubButton />
      </div>

      <FeatureSection icon={Github} title="Cosa significa open source">
        <p>
          Rendere disponibile il software nella sua forma completa: chiunque
          può analizzarne la struttura, comprenderne il comportamento,
          verificare che ogni componente faccia esclusivamente ciò per cui
          è stato progettato. Nel caso di Palacan riguarda la parte più
          importante per la tua privacy — il client che opera sul tuo
          dispositivo, dove le chiavi vengono generate, i messaggi cifrati
          prima di partire e decifrati solo quando raggiungono un
          destinatario autorizzato.
        </p>
      </FeatureSection>

      <FeatureSection icon={KeyRound} title="La sicurezza non nasce dal segreto" accent="sage">
        <p>
          Nella crittografia moderna vale un principio semplice: un sistema
          deve restare sicuro anche quando il suo funzionamento è conosciuto
          pubblicamente. La protezione non deve dipendere dal fatto che
          nessuno legga il codice, ma dalla solidità della tecnologia e
          dalla riservatezza di ciò che deve davvero restare segreto — le
          chiavi private degli utenti.
        </p>
        <p>
          Tutto il resto può essere osservato, studiato, messo alla prova
          senza indebolire la protezione. È la differenza tra sicurezza
          costruita sull'oscurità e sicurezza costruita sulla progettazione.
        </p>
      </FeatureSection>

      <FeatureSection icon={ShieldCheck} title="Cosa rende verificabile Palacan" accent="blue">
        <IconList items={VERIFIABLE_ITEMS} />
      </FeatureSection>

      <FeatureSection icon={Users} title="Perché lo pubblichiamo" accent="terracotta">
        <p>
          Aprire il codice significa lasciare che competenze diverse —
          sviluppatori, ricercatori di sicurezza, università — osservino lo
          stesso sistema, individuino criticità e contribuiscano al suo
          miglioramento. Problemi e vulnerabilità possono emergere da
          un'analisi esterna, prima di trasformarsi in una minaccia reale.
        </p>
        <p>
          Per noi non è una scelta estetica. Un sistema che protegge
          comunicazioni personali deve offrire più di una promessa: deve
          offrire gli strumenti per essere valutato.
        </p>
      </FeatureSection>

      <FeatureSection icon={EyeOff} title="Cosa non è open source" accent="rose">
        <p>
          Il client è open source. L'infrastruttura server — il
          trasferimento dei messaggi cifrati, i servizi operativi, gli
          strumenti amministrativi dei workspace aziendali — resta invece
          proprietaria, per mantenere un controllo diretto sulla sicurezza
          operativa.
        </p>
        <p>
          Ma il server non è un punto critico per la riservatezza: grazie
          alla cifratura end-to-end, i messaggi sono già protetti quando lo
          raggiungono. Può trasportarli. Non può leggerli.
        </p>
      </FeatureSection>

      <p>
        La maggior parte dei servizi chiede di credere alle proprie
        dichiarazioni sulla privacy. Palacan sceglie un percorso diverso:
        anche chi non leggerà mai una riga di codice può sapere che quel
        codice esiste, è disponibile, e ogni scelta tecnica può essere
        messa alla prova. Perché la privacy più forte non è quella
        promessa. È quella dimostrabile.
      </p>
    </PublicLayout>
  );
}
