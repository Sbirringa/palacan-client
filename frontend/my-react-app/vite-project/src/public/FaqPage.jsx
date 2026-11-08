// frontend/src/public/FaqPage.jsx
//
// v2: da lista statica di domande/risposte (tutte aperte, muro di testo
// da scorrere) ad accordion — una domanda alla volta, click per aprire.
// Stessa palette "Ink & Signal" di PublicLayout.jsx/LandingPage.jsx.
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import PublicLayout from './PublicLayout';

const ACCENT_COLORS = ['#0F766E', '#155E75', '#7A8F73', '#A0708A', '#B39456'];

const FAQ_ITEMS = [
  {
    q: 'Gli amministratori possono leggere i miei messaggi?',
    a: "No. I messaggi sono progettati per essere protetti tramite crittografia end-to-end. Il server gestisce il recapito delle comunicazioni ma non dispone delle chiavi necessarie per leggerne il contenuto.",
  },
  {
    q: 'Cosa succede quando invio un messaggio?',
    a: 'Il messaggio viene cifrato sul tuo dispositivo prima della trasmissione. Il server lo recapita ai destinatari autorizzati, che lo decifrano direttamente sui propri dispositivi.',
  },
  {
    q: 'Come funziona il backup delle chiavi?',
    a: "Le chiavi di crittografia possono essere salvate in un backup cifrato protetto da una passphrase scelta dall'utente. Solo chi conosce la passphrase può ripristinare il backup.",
  },
  {
    q: 'Se dimentico la passphrase?',
    a: 'Per motivi di sicurezza la passphrase non viene memorizzata dal server e non può essere recuperata. Se viene smarrita e non disponi di un dispositivo che conserva ancora le chiavi, il backup non potrà essere ripristinato.',
  },
  {
    q: 'Posso utilizzare più dispositivi?',
    a: 'Sì. La piattaforma è progettata per gestire più dispositivi associati allo stesso account, mantenendo la protezione delle comunicazioni attraverso la sincronizzazione delle chiavi crittografiche.',
  },
  {
    q: 'Le password vengono memorizzate in chiaro?',
    a: 'No. Le password non vengono mai archiviate in formato leggibile. Vengono memorizzati esclusivamente hash sicuri delle credenziali.',
  },
  {
    q: 'I miei dati vengono venduti a terzi?',
    a: 'No. I dati personali non vengono venduti né utilizzati per finalità pubblicitarie. Sono trattati esclusivamente per fornire il servizio e garantirne sicurezza e affidabilità.',
  },
  {
    q: 'Il server può modificare i messaggi?',
    a: 'Il server gestisce il recapito delle comunicazioni ma non può interpretare il contenuto dei messaggi protetti dalla crittografia end-to-end.',
  },
  {
    q: 'La piattaforma è ancora in sviluppo?',
    a: "Sì. Il progetto è in continua evoluzione. Lavoriamo costantemente per migliorare sicurezza, prestazioni, affidabilità ed esperienza d'uso, introducendo nuove funzionalità e aggiornamenti nel rispetto dei principi di privacy e protezione dei dati.",
  },
];

const EASE = [0.4, 0, 0.2, 1];

function FaqItem({ item, isOpen, onToggle, accentColor }) {
  return (
    <div className="border-b border-[#E4E4E7] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-display text-[15px] font-medium text-[#1A1A1A]">{item.q}</span>
        <ChevronDown
          size={16}
          style={{ color: accentColor }}
          className={`shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="pb-5 pr-8 text-sm leading-7 text-[#6B7280]">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FaqPage() {
  // Prima domanda aperta di default, così la pagina non appare vuota
  // all'arrivo. -1 = tutte chiuse.
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <PublicLayout>
      <h1>Le risposte, prima ancora che tu debba chiederle.</h1>
      <p>
        Le risposte più richieste su privacy, sicurezza e funzionamento di
        Palacan. Clicca una domanda per aprirla.
      </p>

      {/* not-prose: esce dalla gerarchia tipografica del plugin, così le
         classi qui sotto non vengono sovrascritte dalle regole prose-*. */}
      <div className="not-prose mt-8 rounded-xl border border-[#E4E4E7] bg-white px-6">
        {FAQ_ITEMS.map((item, i) => (
          <FaqItem
            key={item.q}
            item={item}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex((prev) => (prev === i ? -1 : i))}
            accentColor={ACCENT_COLORS[i % ACCENT_COLORS.length]}
          />
        ))}
      </div>
    </PublicLayout>
  );
}
