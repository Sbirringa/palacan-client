// frontend/src/public/EcosistemaPage.jsx
import React from 'react';
import {
  UserPlus,
  MessageSquare,
  Users,
  Building2,
  Layers,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-react';
import PublicLayout, { FeatureSection, SectionDivider } from './PublicLayout';

export default function EcosistemaPage() {
  return (
    <PublicLayout>
      <h1>Scopri come funziona Palacan.<br />Dalla comunicazione personale alla collaborazione aziendale.</h1>
      <p>
        Un'esperienza progettata per accompagnarti fin dal primo
        utilizzo, rendendo ogni passaggio semplice, naturale e
        immediato.
      </p>

      <hr className="not-prose my-10 border-[#E4E4E7]" />

      <SectionDivider
        eyebrow="Account personale"
        title="Uso individuale"
        description="Le funzionalità pensate per chi utilizza Palacan in autonomia, senza far parte di un'organizzazione."
        accent="terracotta"
      />

      <FeatureSection icon={UserPlus} title="Il tuo account" noTopBorder>
        <p>
          <strong>Come ci si iscrive.</strong> Ti servono solo due cose: un
          nome utente e una password che scegli tu. Niente email, niente
          numero di telefono, niente documenti. Non c'è nulla, nel tuo
          account, che ti colleghi a un'identità verificabile dall'esterno.
        </p>
        <p>
          <strong>Se dimentichi la password.</strong> Non essendoci
          un'email collegata al tuo account, non esiste il classico "ti
          mandiamo un'email per reimpostarla". Il sistema di Palacan
          funziona diversamente, ed è pensato per restare nelle tue sole
          mani: in qualsiasi momento (basta confermare la password che usi
          in quel momento) puoi generare un codice di recupero personale,
          un codice del tipo XXXX-XXXX-XXXX-XXXX. Questo codice ti viene
          mostrato una sola volta: è come la combinazione di una cassaforte
          che vedi scritta un'unica volta e poi devi ricordarti dove
          l'hai messa. Salvalo subito in un posto sicuro (ad esempio
          scritto su carta, o in un gestore di password). Se in futuro
          dimentichi la password, userai questo codice per impostarne una
          nuova. Attenzione: generare un nuovo codice rende automaticamente
          inutilizzabile quello vecchio — ne hai sempre e solo uno attivo.
          E quando lo usi per cambiare password, per sicurezza vengono
          chiuse automaticamente tutte le sessioni aperte sul tuo account
          (su tutti i dispositivi), così se qualcun altro aveva avuto
          accesso viene escluso.
        </p>
        <p>
          <strong>Backup delle tue chiavi.</strong> Le "chiavi" sono ciò
          che rende possibile leggere le tue conversazioni cifrate — sono
          generate direttamente sul tuo dispositivo. Puoi farne una copia
          di sicurezza (un backup): prima di essere inviata ai server di
          Palacan, questa copia viene a sua volta cifrata sul tuo
          dispositivo, quindi anche qui il server riceve e conserva solo
          qualcosa che non può leggere. Puoi caricare, scaricare o
          eliminare questo backup quando vuoi, dalle impostazioni del tuo
          account.
        </p>
      </FeatureSection>

      <FeatureSection icon={MessageSquare} title="Conversazioni" accent="blue">
        <p>
          <strong>Come funzionano i messaggi.</strong> Quando scrivi un
          messaggio, il tuo telefono o computer lo cifra prima ancora di
          inviarlo: esce dal tuo dispositivo già "chiuso a chiave". Il
          server di Palacan lo riceve così, cifrato, e lo consegna al
          destinatario senza mai poterlo aprire e leggere — nemmeno noi che
          gestiamo il servizio possiamo farlo. Se la persona a cui scrivi è
          online, il messaggio le arriva all'istante; se è offline, resta
          in attesa e le viene consegnato non appena si riconnette. Ogni
          conversazione conserva i messaggi più recenti, sempre in questa
          forma cifrata.
        </p>
        <p>
          <strong>Chat con un contatto.</strong> Non devi creare
          manualmente una stanza per parlare con qualcuno: la prima volta
          che scrivi a un tuo contatto, Palacan apre automaticamente la
          vostra conversazione privata.
        </p>
        <p>
          <strong>Aggiungere contatti.</strong> Puoi cercare una persona
          per il suo nome utente e mandarle una richiesta di contatto; lei
          potrà accettarla o rifiutarla. Curiosità: se capita che voi due
          vi mandiate la richiesta a vicenda, quasi nello stesso momento,
          Palacan se ne accorge e vi collega direttamente come contatti,
          senza farvi accettare nulla due volte. Ogni richiesta — arrivata,
          accettata o rifiutata — genera una notifica.
        </p>
        <p>
          <strong>Notifiche.</strong> Ogni evento che ti riguarda — una
          richiesta di contatto, un invito — genera una notifica che resta
          salvata: la trovi anche se in quel momento non eri connesso. Puoi
          anche attivare le notifiche push sul tuo dispositivo, per essere
          avvisato pure ad app chiusa.
        </p>
      </FeatureSection>

      <FeatureSection icon={Users} title="Stanze di gruppo" accent="rose">
        <p>
          <strong>Creare una stanza.</strong> Chiunque può crearne una in
          qualsiasi momento: le dai un nome e, se vuoi una protezione in
          più, anche una password tutta sua (almeno 4 caratteri), diversa
          dalla password del tuo account personale.
        </p>
        <p>
          <strong>Entrare in una stanza.</strong> Se la stanza ha una
          password, te la chiede al momento di entrare. Se non ce l'ha,
          entri subito.
        </p>
        <p>
          <strong>Invitare qualcuno in una stanza.</strong> Due modi, a
          seconda di cosa ti serve: un invito diretto, cercando la persona
          per nome utente — lei dovrà accettarlo o rifiutarlo; oppure un
          link di invito, da condividere ovunque (anche fuori da Palacan,
          ad esempio per email o su un altro canale), protetto
          opzionalmente da una password. Chiunque apra il link ed effettui
          l'accesso entra direttamente nella stanza.
        </p>
        <p>
          <strong>Uscire da una stanza.</strong> Puoi farlo in qualsiasi
          momento, senza dover chiedere il permesso a nessuno.
        </p>
        <p>
          <strong>Cancellare un messaggio.</strong> Puoi eliminare solo i
          messaggi che hai scritto tu.
        </p>
      </FeatureSection>

            <SectionDivider
        eyebrow="Workspace aziendale"
        title="Uso aziendale"
        description="Le funzionalità aggiuntive che un'organizzazione ottiene attivando un workspace dedicato."
        accent="blue"
      />

      <FeatureSection icon={Building2} title="Attivazione e accesso aziendale" accent="sage" noTopBorder>
        <p>
          <strong>Come nasce un'azienda su Palacan.</strong> Attivare un
          workspace aziendale richiede un unico modulo, compilato una sola
          volta: il token di licenza che vi è stato assegnato, il nome
          dell'azienda, e le credenziali (nome utente e password) del primo
          amministratore. Da quel momento il workspace esiste, ed è
          l'amministratore a occuparsi di tutto il resto — non serve nessun
          altro passaggio di attivazione.
        </p>
        <p>
          <strong>Login aziendale.</strong> A differenza dell'account Free,
          per accedere al workspace aziendale serve anche il nome
          dell'azienda oltre a nome utente e password — un livello in più
          che assicura che si stia entrando nel workspace corretto. Se la
          licenza dell'azienda risultasse scaduta o revocata, l'accesso
          viene bloccato automaticamente.
        </p>
        <p>
          <strong>Creazione dei dipendenti.</strong> È l'amministratore a
          creare l'account di ogni dipendente dal proprio pannello: sceglie
          lui username e una password provvisoria — anche qui nessuna email
          richiesta. Al primo accesso, il dipendente viene guidato
          attraverso una schermata dedicata dove è obbligato a scegliere
          una nuova password personale, che solo lui conoscerà: la
          password provvisoria dell'amministratore smette di funzionare da
          quel momento. L'amministratore può anche assegnare il dipendente,
          già in fase di creazione, a una o più stanze o reparti esistenti.
        </p>
      </FeatureSection>

      <FeatureSection icon={Layers} title="Organizzazione interna" accent="bronze">
        <p>
          <strong>Reparti.</strong> Oltre alle normali stanze di
          conversazione, un amministratore (o un owner) può creare reparti:
          stanze pensate per restare stabili nel tempo, dedicate
          all'organizzazione interna dell'azienda (ad esempio un reparto
          "Vendite" o "Sviluppo"). L'amministratore può aggiungere un
          dipendente a un reparto, rimuoverlo, o spostarlo da un reparto a
          un altro, in qualsiasi momento.
        </p>
        <p>
          <strong>Chat dirette tra colleghi.</strong> Scrivendo per la
          prima volta a un collega, Palacan apre — o ritrova, se esiste
          già — la vostra conversazione privata uno-a-uno: non capita mai
          di ritrovarsi con due chat duplicate con la stessa persona.
        </p>
        <p>
          <strong>Aggiungere qualcuno a una stanza (due modi).</strong>{' '}
          Anche in azienda esistono due strade distinte: un membro già
          dentro la stanza può invitare un collega, che dovrà accettare;
          oppure, con l'apposita funzione di aggiunta diretta, un collega
          può essere inserito immediatamente nella stanza senza dover
          accettare nulla — utile ad esempio per un amministratore che
          vuole popolare rapidamente una stanza.
        </p>
        <p>
          <strong>Stato delle stanze.</strong> Ogni stanza aziendale può
          essere impostata su stati diversi (attiva, archiviata, bloccata)
          dall'amministratore, per riflettere la fase della sua vita — ad
          esempio archiviare un progetto concluso senza cancellarne la
          cronologia.
        </p>
      </FeatureSection>

      <FeatureSection icon={ShieldCheck} title="Ruoli e sicurezza amministrativa" accent="blue">
        <p>
          <strong>Ruoli e permessi su misura.</strong> L'amministratore può
          creare ruoli personalizzati, ciascuno con l'esatto insieme di
          permessi che gli serve, scelti da un elenco granulare di funzioni
          disponibili — nulla di preconfezionato o forzato. Un ruolo può
          essere valido in una singola stanza oppure sull'intero workspace.
          I ruoli personalizzati non possono mai sovrascrivere o modificare
          i tre ruoli di base già previsti dal sistema.
        </p>
        <p>
          <strong>Silenziare un partecipante.</strong> All'interno di una
          singola stanza, un amministratore può silenziare temporaneamente
          qualcuno: la persona resta dentro la stanza e può continuare a
          leggere, ma i suoi messaggi smettono di essere inoltrati agli
          altri finché non viene ripristinata.
        </p>
        <p>
          <strong>Bloccare e sbloccare un account.</strong> Se necessario,
          l'amministratore può bloccare un account con effetto immediato:
          tutte le sue sessioni attive vengono chiuse nello stesso istante,
          e se la persona è connessa proprio in quel momento viene
          disconnessa in tempo reale — non deve aspettare che il suo
          accesso scada naturalmente. Lo sblocco riporta l'account
          operativo con la stessa immediatezza.
        </p>
        <p>
          <strong>Gestione di sessioni e dispositivi.</strong>
          L'amministratore può vedere l'elenco di tutte le sessioni attive
          di un dipendente (cioè da quali dispositivi/accessi è connesso),
          terminarne una singola oppure tutte insieme, o forzare una nuova
          autenticazione — utile in caso di dispositivo smarrito o di un
          accesso sospetto.
        </p>
        <p>
          <strong>Reimpostare la password di un dipendente.</strong> Se un
          dipendente perde le proprie credenziali, l'amministratore può
          reimpostargliene una nuova direttamente dal pannello.
        </p>
        <p>
          <strong>Cancellare un messaggio.</strong> Vale la stessa regola
          del Free — chi ha scritto un messaggio può cancellarlo — con in
          più la possibilità, per un amministratore, di rimuovere qualunque
          messaggio nelle stanze che gestisce.
        </p>
      </FeatureSection>

      <FeatureSection icon={LayoutDashboard} title="Controllo e visibilità" accent="rose">
        <p>
          <strong>Registro di controllo.</strong> Ogni azione
          amministrativa lascia una traccia consultabile e filtrabile:
          creazione o modifica di un ruolo, blocco di un account, cambio di
          stato di una stanza, terminazione di una sessione — sempre con
          chi l'ha fatta, quando, e su chi. Nulla accade
          nell'amministrazione del workspace senza restare visibile.
        </p>
        <p>
          <strong>Dashboard.</strong> L'amministratore ha una panoramica
          sempre aggiornata dell'intera azienda su Palacan: numero totale
          di stanze, di utenti, di messaggi scambiati, quante persone sono
          online in questo momento, come sono distribuite le stanze per
          stato e per tipo, come sono distribuiti gli utenti per ruolo, e
          le ultime azioni registrate nel log di controllo.
        </p>
      </FeatureSection>
    </PublicLayout>
  );
}
