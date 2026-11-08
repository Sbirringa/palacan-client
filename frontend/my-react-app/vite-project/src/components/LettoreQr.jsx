import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, ImageUp } from 'lucide-react';
import { decodificaQr } from '../utils/verificaQr';

/**
 * [palacan-l4b] Lettore di codici QR per la verifica dell'identita'. Tutto sul dispositivo: la fotocamera resta nel
 * browser, nessuna immagine esce. Se la fotocamera non c'e' (o e' negata) si puo' scegliere una foto del codice.
 */
const LATO_MASSIMO = 720;
const INTERVALLO_MS = 200;

function pixelDa(sorgente, larghezza, altezza, canvas) {
  const scala = Math.min(1, LATO_MASSIMO / Math.max(larghezza, altezza));
  const w = Math.max(1, Math.round(larghezza * scala));
  const h = Math.max(1, Math.round(altezza * scala));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(sorgente, 0, 0, w, h);
  return { dati: ctx.getImageData(0, 0, w, h).data, w, h };
}

export default function LettoreQr({ onLetto, onAnnulla }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const onLettoRef = useRef(onLetto);
  const lettoRef = useRef(false);
  const [errore, setErrore] = useState(null);

  useEffect(() => {
    onLettoRef.current = onLetto;
  }, [onLetto]);

  useEffect(() => {
    let flusso = null;
    let timer = null;
    let chiuso = false;

    const consegna = (testo) => {
      if (lettoRef.current) return;
      lettoRef.current = true;
      onLettoRef.current?.(testo);
    };

    const leggiFotogramma = () => {
      if (chiuso || lettoRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth) {
        const p = pixelDa(video, video.videoWidth, video.videoHeight, canvas);
        const testo = p ? decodificaQr(p.dati, p.w, p.h) : null;
        if (testo) {
          consegna(testo);
          return;
        }
      }
      timer = window.setTimeout(leggiFotogramma, INTERVALLO_MS);
    };

    (async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setErrore(t('safety_number.qr_no_camera', 'Fotocamera non disponibile su questo dispositivo: scegli una foto del codice.'));
        return;
      }
      try {
        flusso = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (chiuso) {
          flusso.getTracks().forEach((traccia) => traccia.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = flusso;
        await video.play().catch(() => {});
        leggiFotogramma();
      } catch (e) {
        setErrore(t('safety_number.qr_camera_denied', 'Non posso usare la fotocamera (permesso negato o occupata): scegli una foto del codice.'));
      }
    })();

    return () => {
      chiuso = true;
      if (timer) window.clearTimeout(timer);
      if (flusso) flusso.getTracks().forEach((traccia) => traccia.stop());
    };
  }, [t]);

  const handleFoto = async (evento) => {
    const file = evento.target.files && evento.target.files[0];
    evento.target.value = '';
    if (!file || !canvasRef.current) return;
    const indirizzo = URL.createObjectURL(file);
    try {
      const immagine = new Image();
      await new Promise((ok, ko) => {
        immagine.onload = ok;
        immagine.onerror = ko;
        immagine.src = indirizzo;
      });
      const p = pixelDa(immagine, immagine.naturalWidth, immagine.naturalHeight, canvasRef.current);
      const testo = p ? decodificaQr(p.dati, p.w, p.h) : null;
      if (testo) {
        lettoRef.current = true;
        onLettoRef.current?.(testo);
      } else {
        setErrore(t('safety_number.qr_photo_none', 'Nessun codice trovato nella foto. Riprova più da vicino, con più luce.'));
      }
    } catch (e) {
      setErrore(t('safety_number.qr_photo_none', 'Nessun codice trovato nella foto. Riprova più da vicino, con più luce.'));
    } finally {
      URL.revokeObjectURL(indirizzo);
    }
  };

  return (
    <div className="mb-4">
      <div className="relative mb-3 overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="block aspect-square w-full object-cover" muted playsInline />
        {!errore && (
          <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70" />
        )}
        {errore && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-white/90">
            <span className="flex flex-col items-center gap-2">
              <Camera size={20} />
              {errore}
            </span>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400">
        {t('safety_number.qr_scan_help', 'Inquadra il codice QR sullo schermo del tuo contatto.')}
      </p>
      <div className="flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
          <ImageUp size={14} />
          {t('safety_number.qr_photo', 'Scegli una foto')}
          <input type="file" accept="image/*" className="hidden" onChange={handleFoto} />
        </label>
        {onAnnulla && (
          <button
            type="button"
            onClick={onAnnulla}
            className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {t('safety_number.qr_cancel', 'Annulla')}
          </button>
        )}
      </div>
    </div>
  );
}
