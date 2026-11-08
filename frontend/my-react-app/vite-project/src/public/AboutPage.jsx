// frontend/src/public/AboutPage.jsx
import React from 'react';
import { Heart, Compass, Rocket, Users } from 'lucide-react';
import PublicLayout, { FeatureSection } from './PublicLayout';

export default function AboutPage() {
  return (
    <PublicLayout>
      <h1>Non siamo un'alternativa.<br />Siamo un nuovo standard.</h1>
      <p>
        Non un'altra app di messaggistica.<br />Un'idea diversa su cosa
        dovrebbe significare comunicare.
      </p>

      <FeatureSection icon={Heart} title="La nostra missione">
        <p>
          Siamo un team unito da una certezza: la tecnologia migliore è
          quella progettata per restituire il controllo alle persone.
        </p>
        <p>
          Palacan nasce da una domanda che ci siamo posti osservando il
          mondo in cui viviamo: quanto della nostra identità siamo
          disposti a condividere per accedere agli strumenti che fanno
          parte della nostra quotidianità?
        </p>
        <p>
          Negli anni, comunicare online è diventato più semplice e
          immediato, ma anche sempre più legato alla condivisione di
          informazioni personali. Un numero di telefono, un indirizzo
          email, abitudini e comportamenti sono diventati elementi
          considerati normali per accedere ai servizi che utilizziamo
          ogni giorno.
        </p>
        <p>
          Abbiamo scelto di mettere in discussione questa normalità e
          immaginare un approccio diverso: creare un'esperienza in cui
          ciò che non è necessario non diventi una condizione per
          partecipare.
        </p>
        <p>
          Da questa visione prende forma Palacan.
        </p>
        <p>
          Non siamo nati per aggiungere un'altra piattaforma.
        </p>
        <p
          className="not-prose my-2 border-l-4 pl-5 text-xl font-semibold leading-snug"
          style={{ borderColor: '#0F766E', color: '#0F766E' }}
        >
          Siamo nati per ridefinire il modo in cui le persone si connettono.
        </p>
      </FeatureSection>

      <FeatureSection icon={Compass} title="I nostri principi" accent="blue">
        <p>
          Crediamo che comunicare liberamente sia un diritto, non una
          concessione.
        </p>
        <p>
          Crediamo che sicurezza e semplicità debbano convivere. La
          tecnologia affidabile non è quella che aggiunge complessità, ma
          quella che protegge senza interferire con l'esperienza utente.
        </p>
        <p>
          Crediamo che la fiducia non debba dipendere soltanto dalle
          promesse di chi costruisce un servizio, ma dalla possibilità di
          comprenderne il funzionamento e verificarne le fondamenta.
        </p>
        <p>
          Per questo sviluppiamo Palacan secondo un'etica di trasparenza:
          il codice dell'applicazione è pubblico e l'architettura del
          progetto è pensata per essere osservata, analizzata e
          verificata.
        </p>
        <p>
          Non chiediamo agli utenti di affidarsi esclusivamente alle
          nostre parole.
        </p>
        <p>
          Abbiamo scelto di costruire una tecnologia in cui la tutela dei
          dati non sia affidata a una dichiarazione, ma sia una
          conseguenza naturale delle scelte progettuali.
        </p>
        <p>
          Perché il modo più efficace per proteggere la privacy non è
          promettere di non utilizzare le informazioni.
        </p>
        <p
          className="not-prose my-2 border-l-4 pl-5 text-xl font-semibold leading-snug"
          style={{ borderColor: '#0F766E', color: '#0F766E' }}
        >
          È progettare un sistema che non abbia bisogno di raccoglierle.
        </p>
      </FeatureSection>

      <FeatureSection icon={Rocket} title="Il nostro impegno" accent="rose">
        <p>
          Abbiamo scelto un modo diverso di intendere la tecnologia:
          creare strumenti che rispettino le persone senza chiedere loro
          più di quanto sia realmente necessario.
        </p>
        <p>
          Questo impegno nasce dalla visione che ha dato origine a
          Palacan e guida ogni sua evoluzione: offrire un'esperienza
          digitale in cui comunicare non significhi rinunciare alla
          propria identità o accettare compromessi considerati
          inevitabili.
        </p>
        <p>
          Seguire questa direzione significa compiere scelte precise,
          anche quando richiedono un approccio diverso rispetto agli
          standard del settore. Significa non limitarsi a seguire ciò che
          è già affermato, ma continuare a costruire secondo una
          prospettiva più attenta al rapporto tra tecnologia e individuo.
        </p>
        <p
          className="not-prose my-2 border-l-4 pl-5 text-xl font-semibold leading-snug"
          style={{ borderColor: '#0F766E', color: '#0F766E' }}
        >
          Perché un prodotto non si definisce soltanto dalle possibilità che offre, ma anche dai confini che decide di rispettare.
        </p>
      </FeatureSection>

      <FeatureSection icon={Users} title="Costruito insieme" accent="sage">
        <p>
          Palacan non nasce come un prodotto immutabile, ma come un
          progetto in continua evoluzione, capace di crescere attraverso
          il dialogo con chi sceglie di farne parte.
        </p>
        <p>
          Crediamo che le idee migliori non si esauriscano nel momento
          della loro nascita, ma prendano forma attraverso l'ascolto, il
          confronto e la capacità di adattarsi alle esigenze reali.
        </p>
        <p>
          Ogni esperienza, osservazione e contributo diventa parte del
          cammino che ci permette di migliorare e guardare avanti.
        </p>
        <p>
          Continuiamo a sviluppare Palacan con una direzione precisa,
          lasciando spazio alle nuove possibilità che emergeranno nel
          tempo.
        </p>
        <p
          className="not-prose my-2 border-l-4 pl-5 text-xl font-semibold leading-snug"
          style={{ borderColor: '#0F766E', color: '#0F766E' }}
        >
          Perché il valore di un prodotto non risiede soltanto in ciò che offre, ma anche nel legame che riesce a creare con la comunità che lo accompagna.
        </p>
      </FeatureSection>
    </PublicLayout>
  );
}
