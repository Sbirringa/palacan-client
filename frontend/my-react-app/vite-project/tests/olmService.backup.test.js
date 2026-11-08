// tests/olmService.backup.test.js
//
// Test reali sul meccanismo di backup delle chiavi - il pezzo piu'
// sensibile rimasto: se la cifratura fosse debole, un backup rubato
// esporrebbe TUTTO il materiale crittografico dell'utente. Verificato
// prima con esecuzione reale isolata (Argon2id + AES-GCM veri, non
// finti) che il meccanismo di fondo sia solido, poi con le funzioni
// esportate vere dell'app.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  initOlm,
  createOlmAccount,
  buildBackupBundlePayload,
  encryptBackupBundle,
  decryptBackupBundle,
  restoreBackupBundleToLocalStorage,
} from '../src/olmService.js';
vi.setConfig({ testTimeout: 30000 });  // [palacan-n1] Argon2id e' lento apposta: con il PC carico 5 s non bastano

const PASSPHRASE_VALIDA = 'questa e una passphrase lunga abbastanza';

beforeEach(async () => {
  localStorage.clear();
  await initOlm();
});

describe('Backup delle chiavi — andata e ritorno con cifratura vera', () => {
  it('un bundle cifrato e poi decifrato con la passphrase corretta corrisponde esattamente all\'originale', async () => {
    createOlmAccount('alice_backup');
    const bundle = buildBackupBundlePayload('alice_backup');

    const backupCifrato = await encryptBackupBundle(bundle, PASSPHRASE_VALIDA);
    const bundleDecifrato = await decryptBackupBundle(backupCifrato, PASSPHRASE_VALIDA);

    expect(bundleDecifrato).toEqual(bundle);
  });

  it('una passphrase SBAGLIATA fa fallire la decrittazione in modo pulito, mai un risultato corrotto silenzioso', async () => {
    createOlmAccount('alice_backup2');
    const bundle = buildBackupBundlePayload('alice_backup2');
    const backupCifrato = await encryptBackupBundle(bundle, PASSPHRASE_VALIDA);

    await expect(
      decryptBackupBundle(backupCifrato, 'una passphrase completamente diversa e sbagliata')
    ).rejects.toThrow();
  });

  it('riusare lo stesso salt per un aggiornamento del backup produce comunque un risultato corretto', async () => {
    createOlmAccount('alice_backup3');
    const bundle1 = buildBackupBundlePayload('alice_backup3');
    const primoBackup = await encryptBackupBundle(bundle1, PASSPHRASE_VALIDA);

    const secondoBackup = await encryptBackupBundle(bundle1, PASSPHRASE_VALIDA, primoBackup.salt);
    expect(secondoBackup.salt).toBe(primoBackup.salt);

    const decifrato = await decryptBackupBundle(secondoBackup, PASSPHRASE_VALIDA);
    expect(decifrato).toEqual(bundle1);
  });
});

describe('Backup delle chiavi — regole minime sulla passphrase', () => {
  it('rifiuta una passphrase troppo corta (meno di 12 caratteri)', async () => {
    // Verificato contando i caratteri uno per uno prima di lanciare il
    // test: 'corta12345' = 10 caratteri, sotto la soglia di 12.
    await expect(encryptBackupBundle({}, 'corta12345')).rejects.toThrow();
    expect('corta12345'.length).toBeLessThan(12); // conferma esplicita del conteggio
  });

  it('accetta esattamente al limite di 12 caratteri (se non banale)', async () => {
    // 'corta1234567' = 12 caratteri esatti - deve essere accettata,
    // il limite e' ">= 12", non "> 12".
    expect('corta1234567'.length).toBe(12);
    const risultato = await encryptBackupBundle({ test: true }, 'corta1234567');
    expect(risultato.encrypted_blob).toBeTruthy();
  });

  it('rifiuta una passphrase composta solo da numeri', async () => {
    await expect(encryptBackupBundle({}, '123456789012')).rejects.toThrow();
  });

  it('rifiuta una passphrase fatta di un solo carattere ripetuto', async () => {
    await expect(encryptBackupBundle({}, 'aaaaaaaaaaaa')).rejects.toThrow();
  });

  it('accetta una passphrase valida di almeno 12 caratteri, non banale', async () => {
    const risultato = await encryptBackupBundle({ test: true }, PASSPHRASE_VALIDA);
    expect(risultato.encrypted_blob).toBeTruthy();
    expect(risultato.salt).toBeTruthy();
  });
});

describe('restoreBackupBundleToLocalStorage — comportamento corretto sulle sessioni 1:1', () => {
  it('NON ripristina mai le sessioni 1:1 (potrebbero essere disallineate col ratchet del contatto)', () => {
    const bundleFinto = {
      username: 'bob_restore',
      account: 'account_pickled_finto',
      sessions: 'sessioni_pickled_finte_da_NON_ripristinare',
      inboundGroupSessions: 'gruppi_pickled_finti',
    };

    restoreBackupBundleToLocalStorage(bundleFinto);

    const chiaveSessioni = 'palacan_olm_sessions_bob_restore';
    // Verifichiamo che la chiave delle sessioni 1:1 NON sia stata scritta -
    // il nome esatto della chiave localStorage e' un dettaglio interno,
    // quindi verifichiamo invece per assenza di QUALUNQUE valore uguale
    // al contenuto delle sessioni finte, in ogni chiave di localStorage.
    let trovatoContenutoSessioni = false;
    for (let i = 0; i < localStorage.length; i++) {
      const chiave = localStorage.key(i);
      if (localStorage.getItem(chiave) === 'sessioni_pickled_finte_da_NON_ripristinare') {
        trovatoContenutoSessioni = true;
      }
    }
    expect(trovatoContenutoSessioni).toBe(false);
  });
});