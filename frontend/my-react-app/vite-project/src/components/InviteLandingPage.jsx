/**
 * InviteLandingPage.jsx — Palacan
 *
 * Pagina pubblica su /i/:token. Nessuna autenticazione richiesta per vederla: chiama GET /invite-links/:token (via
 * apiService.getInviteLinkInfo, senza Authorization) per mostrare chi ha invitato PRIMA di qualunque accesso o
 * registrazione.
 *
 * Aspetto: lo stesso ingresso cinematografico della home (FragmentHero: i frammenti che si compongono in PALACAN),
 * l'ambiente SfondoPalacan dietro e il selettore della lingua. Testi nelle cinque lingue dell'app (testiInvito.js),
 * inglese per impostazione predefinita.
 *
 * Logica INVARIATA rispetto alla versione precedente: stessi due useEffect, stesse chiamate ad apiService, stesso
 * contratto di props verso App.jsx (isAuthenticated, onShowPersonalLogin, onShowPersonalRegister, onRedeemNow).
 *
 * - isAuthenticated = false: si salva il token in pending_invite_token (apiService.setPendingInviteToken) e si
 *   mostrano "Crea un account" / "Ho gia' un account"; il redeem avviene dopo, in App.jsx::handleLogin.
 * - isAuthenticated = true: si chiama subito onRedeemNow(token) (App.jsx::handleInviteLandingRedeemNow).
 *
 * SOLO flusso consumer/free: nessuna via aziendale qui (il link d'invito e' una funzione consumer/free).
 * Un errore mostra una spiegazione nella lingua dell'utente; il dettaglio tecnico (spesso un testo del server)
 * finisce nella console.
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as apiService from '../apiService';
import { nomeDalLink } from '../utils/linkInvito';  // [palacan-metadati-a3.2b1]
import { BRAND, FONT, FragmentHero, LanguageSwitcher, SfondoPalacan } from './palacanBrand';
import { linguaAttiva } from './testiHome';
import { testiInvito } from './testiInvito';

function Pulsante({ primario = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-6 py-3 text-[14px] outline-none transition-[filter,background-color] duration-200 hover:brightness-110 focus-visible:ring-1"
      style={{
        fontFamily: FONT,
        fontWeight: primario ? 500 : 400,
        letterSpacing: '0.01em',
        color: primario ? BRAND.abisso : BRAND.luce,
        background: primario ? BRAND.luce : 'transparent',
        boxShadow: primario ? 'none' : `inset 0 0 0 1px ${BRAND.linea}`,
        '--tw-ring-color': BRAND.luce,
      }}
    >
      {children}
    </button>
  );
}

export default function InviteLandingPage({
  isAuthenticated,
  onShowPersonalLogin,
  onShowPersonalRegister,
  onRedeemNow,
}) {
  const { token } = useParams();
  const { i18n } = useTranslation();
  const t = testiInvito(linguaAttiva(i18n));

  // 'loading' | 'valid' | 'invalid' | 'redeeming'
  const [status, setStatus] = useState('loading');
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  /* Passo 1: informazioni pubbliche sull'invito */
  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }

    let cancelled = false;

    apiService
      .getInviteLinkInfo(token)
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setStatus('valid');
        // Il token si salva PRIMA di qualunque passaggio a login/registrazione, cosi' sopravvive al flusso di
        // autenticazione e anche a un ricaricamento della pagina.
        apiService.setPendingInviteToken(token);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message || '');
        setStatus('invalid');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  /* Passo 2: se l'utente e' GIA' autenticato, ingresso immediato */
  useEffect(() => {
    if (status !== 'valid' || !isAuthenticated) return;

    let cancelled = false;
    setStatus('redeeming');

    (async () => {
      try {
        await onRedeemNow?.(token);
      } catch (e) {
        if (!cancelled) {
          setError(e.message || '');
          setStatus('invalid');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isAuthenticated, token]);

  useEffect(() => {
    if (error) console.warn('Invito non disponibile:', error);
  }, [error]);

  let titolo;
  let sottotitolo = null;
  let azioni = null;

  if (status === 'loading') {
    titolo = t.caricamento;
  } else if (status === 'redeeming') {
    titolo = t.ingresso;
  } else if (status === 'invalid') {
    titolo = t.nonDisponibile;
    sottotitolo = t.nonDisponibileSpiega;
  } else {
    // status === 'valid' && !isAuthenticated: si invita a creare un account (o ad accedere)
    const nomeLink = nomeDalLink();  // [palacan-metadati-a3.2b1] nome dal link, mai dal server
    const chi = info?.inviter_username;
    titolo = chi ? t.invitatoDa(chi) : t.invitato;
    sottotitolo = (
      <>
        {nomeLink && (
          <span className="block" style={{ color: BRAND.luce, marginBottom: 12 }}>
            {t.conversazione(nomeLink)}
          </span>
        )}
        <span className="block">{t.spiegazione}</span>
        {info?.requires_password && (
          <span className="block text-[13px]" style={{ marginTop: 14, opacity: 0.85 }}>
            {t.password}
          </span>
        )}
      </>
    );
    azioni = (
      <>
        <Pulsante primario onClick={onShowPersonalRegister}>{t.creaAccount}</Pulsante>
        <Pulsante onClick={onShowPersonalLogin}>{t.accedi}</Pulsante>
      </>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: BRAND.abisso, color: BRAND.luce, fontFamily: FONT }}>
      {/* lo stesso ambiente della home: oceano di frammenti, campo profondo, nebbie */}
      <SfondoPalacan />
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6" style={{ zIndex: 20 }}>
        <LanguageSwitcher />
      </div>
      <main className="relative" style={{ zIndex: 1 }}>
        <FragmentHero titolo={titolo} sottotitolo={sottotitolo} suggerimento={t.suggerimento} etichettaRivedi={t.rivedi}>
          {azioni}
        </FragmentHero>
      </main>
    </div>
  );
}
