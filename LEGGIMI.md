# Golf HCP per iPhone 0.8

Stessa app della versione Android 0.7, come web app: si apre da Safari e si installa sulla schermata Home. Non serve un Mac, né l'App Store, né un account Apple a pagamento.

## Installazione (una volta sola)
1. Apri il link dell'app con **Safari** sull'iPhone.
2. Tocca il pulsante **Condividi** (il quadrato con la freccia in su).
3. Scegli **Aggiungi alla schermata Home**, poi **Aggiungi**.
4. Da quel momento apri l'app dall'icona verde "Golf HCP", come un'app normale. Funziona anche senza rete sul campo.

## Primo avvio
- **Impostazioni**: inserisci il tuo HI attuale come "HI iniziale" (vale finché non ci sono 3 gare valide).
- **Storico > Importa storico**: scegli l'Excel dei risultati scaricato dalla tua area riservata federgolf (da File, iCloud Drive o dagli allegati mail). Va bene anche il CSV esportato dall'app Android.
- I rating di tutti i 902 percorsi federgolf (tabella del 21/11/2026) sono già dentro l'app.

## Registrare una gara
Come su Android: data, campo (scrivi parte del nome e tocca il percorso), battitore, punti Stableford. CR, Slope e Par si compilano dal battitore e si possono correggere. Vedi subito HCP di gioco, score differential e nuovo HI; "Salva gara" aggiorna subito l'Handicap Index.

## Simula HCP
Scheda "Simula HCP": stessi campi e stessi calcoli di Nuova gara (campo, battitore, Stableford, PCC, 9 buche, punteggio eccezionale), ma non salva niente. Mostra HCP di gioco, score differential, l'Handicap Index che avresti con quel risultato e la variazione rispetto a quello attuale. Utile prima di una gara per vedere quanti punti servono per scendere. "Azzera simulazione" pulisce i campi.

## HCP gioco
Scheda "HCP gioco": scrivi il campo e vedi subito l'HCP di gioco per ogni battitore, calcolato con il tuo Handicap Index attuale (HI × Slope/113 + CR − Par; sui percorsi da 9 buche HI/2). Puoi cambiare l'HI per fare una prova; se il campo non è in elenco inserisci CR, Slope e Par a mano. Non salva niente.

## Andamento HCP
Scheda "Andamento": grafico dell'Handicap Index nel tempo. Scegli il periodo con mese e anno di "Dal" e "Al" (dal primo giorno del mese all'ultimo) oppure con i pulsanti 3 mesi, 6 mesi, 1 anno, Tutto. Tocca il grafico per leggere data e HI di ogni punto. Sotto vedi HI a inizio e fine periodo, la variazione, il minimo e il massimo. Per le gare importate da federgolf usa l'"Index Nuovo" ufficiale; per le altre l'HI ricalcolato dall'app.

## Formule
Identiche alla versione Android (stesso codice di calcolo, verificato sul tuo export federgolf 2025-2026: 39 SD su 39 e 20 "Index Nuovo" su 20 uguali a federgolf).
- HCP di gioco = HI × (Slope ÷ 113) + (CR − Par), arrotondato all'intero.
- Score differential = (113 ÷ Slope) × [Par + HCP di gioco − (Stableford − 36) − CR − PCC], al decimo.
- 9 buche: HCP di gioco = HI/2 × Slope/113 + (CR − Par); SD = differenziale delle 9 (Stableford − 18) + 0,52 × HI + 1,2.
- Punteggio eccezionale: −1 o −2 su quella gara e sulle 19 valide precedenti.
- HI = media dei migliori 8 SD corretti delle ultime 20 valide; tabella WHS sotto le 20 gare. Massimo 54.

## Differenze rispetto ad Android
- **Rating federgolf**: Safari non permette a una pagina di leggere direttamente il sito federgolf. L'app usa quindi la copia della tabella pubblicata accanto all'app, che un aggiornamento automatico rinfresca ogni lunedì (cartella `tools/` e `.github/workflows/`). "Aggiorna rating ora" in Impostazioni scarica l'ultima copia.
- **Copia di sicurezza**: su iPhone non c'è il backup automatico di Android. In Impostazioni "Salva copia di sicurezza" crea un file .json (salvalo in File/iCloud o mandalo via mail); per ripristinarlo usa "Importa storico" e scegli quel file.
- I dati restano solo su questo iPhone, dentro l'app della schermata Home.

## Non ancora gestiti (come su Android)
Soft cap e hard cap rispetto al Low HI degli ultimi 12 mesi.

## File
`index.html`, `app.js` (interfaccia), `golf-core.js` (calcoli, lettura federgolf ed Excel), `ratings.js`/`ratings.json` (tabella rating), `sw.js` (funzionamento senza rete), `manifest.webmanifest` e icone.
