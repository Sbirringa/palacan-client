/* tslint:disable */
/* eslint-disable */

export class Account {
    free(): void;
    [Symbol.dispose](): void;
    create(): void;
    generate_one_time_keys(quante: number): void;
    identity_keys(): string;
    mark_keys_as_published(): void;
    max_number_of_one_time_keys(): number;
    constructor();
    one_time_keys(): string;
    pickle(chiave: any): string;
    /**
     * In vodozemac la chiave usa e getta si consuma gia' quando nasce la sessione in entrata: qui non resta
     * niente da togliere. Esiste per compatibilita' con libolm.
     */
    remove_one_time_keys(_sessione: Session): void;
    sign(messaggio: string): string;
    ultimo_unpickle_convertito(): boolean;
    unpickle(chiave: any, pickle: string): void;
}

export class InboundGroupSession {
    free(): void;
    [Symbol.dispose](): void;
    create(chiave_sessione: string): void;
    /**
     * Come libolm: `{ plaintext, message_index }`.
     */
    decrypt(messaggio: string): any;
    export_session(indice: number): string;
    first_known_index(): number;
    import_session(esportata: string): void;
    constructor();
    pickle(chiave: any): string;
    session_id(): string;
    ultimo_unpickle_convertito(): boolean;
    unpickle(chiave: any, pickle: string): void;
}

export class OutboundGroupSession {
    free(): void;
    [Symbol.dispose](): void;
    create(): void;
    encrypt(testo: string): string;
    message_index(): number;
    constructor();
    pickle(chiave: any): string;
    session_id(): string;
    session_key(): string;
    ultimo_unpickle_convertito(): boolean;
    unpickle(chiave: any, pickle: string): void;
}

export class Session {
    free(): void;
    [Symbol.dispose](): void;
    create_inbound(account: Account, corpo: string): void;
    create_inbound_from(account: Account, identita: string, corpo: string): void;
    create_outbound(account: Account, identita: string, usa_e_getta: string): void;
    decrypt(tipo: number, corpo: string): string;
    /**
     * Come libolm: `{ type, body }`.
     */
    encrypt(testo: string): any;
    has_received_message(): boolean;
    matches_inbound(corpo: string): boolean;
    matches_inbound_from(identita: string, corpo: string): boolean;
    constructor();
    pickle(chiave: any): string;
    session_id(): string;
    ultimo_unpickle_convertito(): boolean;
    unpickle(chiave: any, pickle: string): void;
}

export class Utility {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Come libolm: errore se la firma non e' valida, niente se e' valida.
     */
    ed25519_verify(chiave: string, messaggio: string, firma: string): void;
    constructor();
}

export function pq_apri(seme: string, contesto: string, busta: string): string;

export function pq_chiave_pubblica(seme: string): string;

export function pq_nuovo_seme(): string;

export function pq_sigilla(pubblica: string, contesto: string, testo: string): string;

export function pqfirma_chiave_pubblica(seme: string): string;

export function pqfirma_firma(seme: string, contesto: string, ed_pubblica: string, messaggio: string): string;

export function pqfirma_nuovo_seme(): string;

export function pqfirma_testo_ibrido(contesto: string, ed_pubblica: string, pq_pubblica: string, messaggio: string): string;

export function pqfirma_verifica_ibrida(contesto: string, ed_pubblica: string, pq_pubblica: string, messaggio: string, firma_ed: string, firma_pq: string): boolean;

export function versione(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_account_free: (a: number, b: number) => void;
    readonly __wbg_inboundgroupsession_free: (a: number, b: number) => void;
    readonly __wbg_outboundgroupsession_free: (a: number, b: number) => void;
    readonly __wbg_session_free: (a: number, b: number) => void;
    readonly __wbg_utility_free: (a: number, b: number) => void;
    readonly account_create: (a: number) => void;
    readonly account_generate_one_time_keys: (a: number, b: number) => [number, number];
    readonly account_identity_keys: (a: number) => [number, number, number, number];
    readonly account_mark_keys_as_published: (a: number) => [number, number];
    readonly account_max_number_of_one_time_keys: (a: number) => [number, number, number];
    readonly account_new: () => number;
    readonly account_one_time_keys: (a: number) => [number, number, number, number];
    readonly account_pickle: (a: number, b: any) => [number, number, number, number];
    readonly account_remove_one_time_keys: (a: number, b: number) => [number, number];
    readonly account_sign: (a: number, b: number, c: number) => [number, number, number, number];
    readonly account_ultimo_unpickle_convertito: (a: number) => number;
    readonly account_unpickle: (a: number, b: any, c: number, d: number) => [number, number];
    readonly inboundgroupsession_create: (a: number, b: number, c: number) => [number, number];
    readonly inboundgroupsession_decrypt: (a: number, b: number, c: number) => [number, number, number];
    readonly inboundgroupsession_export_session: (a: number, b: number) => [number, number, number, number];
    readonly inboundgroupsession_first_known_index: (a: number) => [number, number, number];
    readonly inboundgroupsession_import_session: (a: number, b: number, c: number) => [number, number];
    readonly inboundgroupsession_new: () => number;
    readonly inboundgroupsession_pickle: (a: number, b: any) => [number, number, number, number];
    readonly inboundgroupsession_session_id: (a: number) => [number, number, number, number];
    readonly inboundgroupsession_ultimo_unpickle_convertito: (a: number) => number;
    readonly inboundgroupsession_unpickle: (a: number, b: any, c: number, d: number) => [number, number];
    readonly outboundgroupsession_create: (a: number) => void;
    readonly outboundgroupsession_encrypt: (a: number, b: number, c: number) => [number, number, number, number];
    readonly outboundgroupsession_message_index: (a: number) => [number, number, number];
    readonly outboundgroupsession_new: () => number;
    readonly outboundgroupsession_pickle: (a: number, b: any) => [number, number, number, number];
    readonly outboundgroupsession_session_id: (a: number) => [number, number, number, number];
    readonly outboundgroupsession_session_key: (a: number) => [number, number, number, number];
    readonly outboundgroupsession_ultimo_unpickle_convertito: (a: number) => number;
    readonly outboundgroupsession_unpickle: (a: number, b: any, c: number, d: number) => [number, number];
    readonly pq_apri: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly pq_chiave_pubblica: (a: number, b: number) => [number, number, number, number];
    readonly pq_nuovo_seme: () => [number, number, number, number];
    readonly pq_sigilla: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly pqfirma_chiave_pubblica: (a: number, b: number) => [number, number, number, number];
    readonly pqfirma_firma: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly pqfirma_nuovo_seme: () => [number, number, number, number];
    readonly pqfirma_testo_ibrido: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly pqfirma_verifica_ibrida: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => number;
    readonly session_create_inbound: (a: number, b: number, c: number, d: number) => [number, number];
    readonly session_create_inbound_from: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly session_create_outbound: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly session_decrypt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly session_encrypt: (a: number, b: number, c: number) => [number, number, number];
    readonly session_has_received_message: (a: number) => [number, number, number];
    readonly session_matches_inbound: (a: number, b: number, c: number) => [number, number, number];
    readonly session_matches_inbound_from: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly session_new: () => number;
    readonly session_pickle: (a: number, b: any) => [number, number, number, number];
    readonly session_session_id: (a: number) => [number, number, number, number];
    readonly session_ultimo_unpickle_convertito: (a: number) => number;
    readonly session_unpickle: (a: number, b: any, c: number, d: number) => [number, number];
    readonly utility_ed25519_verify: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number];
    readonly utility_new: () => number;
    readonly versione: () => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
