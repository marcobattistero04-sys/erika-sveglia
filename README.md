# ⏰ Erika Sveglie – Guida all'installazione

App PWA per la gestione sveglie autisti Erika Bus S.r.l.

---

## 🏗️ Architettura

```
📱 App PWA (Netlify)          🗄️ Supabase            📞 Twilio
  ↕ Realtime updates    ←→   alarms / drivers    →   chiamate + SMS
  Installabile su iOS/Android  settings            automatici ogni minuto
```

---

## 1. Supabase – Database

1. Vai su **https://supabase.com** → tuo progetto
2. **SQL Editor** → incolla tutto il contenuto di `supabase-schema.sql` → Esegui
3. Copia da **Project Settings → API**:
   - `Project URL` → es. `https://abcdef.supabase.co`
   - `anon public key`

---

## 2. Twilio – Chiamate e SMS

1. Crea account su **https://twilio.com**
2. Ottieni un numero Twilio italiano (o internazionale)
3. Copia da **Console**:
   - `Account SID`
   - `Auth Token`
   - `Twilio phone number` (formato: +39...)

> 💡 Costo indicativo: ~€0.013/min chiamata, ~€0.05/SMS verso Italia

---

## 3. Configurazione index.html

Apri `index.html` e sostituisci nella sezione `ERIKA_CONFIG`:

```javascript
window.ERIKA_CONFIG = {
  SUPABASE_URL: 'https://XXXX.supabase.co',   // ← il tuo URL
  SUPABASE_ANON_KEY: 'eyJ...',                 // ← la tua anon key
  NETLIFY_TRIGGER_FN: '/.netlify/functions/trigger-alarm'
};
```

---

## 4. Deploy su Netlify

### Variabili d'ambiente (Netlify → Site settings → Environment variables):

| Variabile               | Valore                         |
|------------------------|-------------------------------|
| `SUPABASE_URL`         | https://xxxx.supabase.co      |
| `SUPABASE_SERVICE_KEY` | service_role key (NON anon)   |
| `TWILIO_ACCOUNT_SID`   | ACxxxxxxxxxxxxxxxxxxxxxxx      |
| `TWILIO_AUTH_TOKEN`    | il tuo auth token              |
| `TWILIO_FROM_NUMBER`   | +39xxxxxxxxxx (numero Twilio)  |

### Deploy:
```bash
# Dalla cartella sveglie-erika:
zip -r ../sveglie-erika.zip .   # zip con index.html alla radice

# Carica su Netlify via drag & drop o collega GitHub repo
```

---

## 5. Installa sui cellulari

### Android (Chrome):
1. Apri l'URL del sito Netlify in Chrome
2. Menu (⋮) → "Aggiungi a schermata Home"
3. L'app appare con l'icona Erika

### iPhone (Safari):
1. Apri l'URL in Safari
2. Condividi (□↑) → "Aggiungi a schermata Home"
3. Conferma

---

## ⚙️ Come funziona

1. **Ogni minuto** la funzione Netlify `check-alarms` interroga Supabase
2. Se trova sveglie con orario = adesso → attiva chiamata Twilio all'autista + SMS
3. Se dopo N minuti l'autista non ha confermato → chiamata al numero ufficio + SMS allerta
4. L'app si aggiorna in **tempo reale** su tutti i dispositivi via Supabase Realtime

---

## 📋 Impostazioni nel database

```sql
-- Aggiorna numero ufficio (dall'app o direttamente SQL):
UPDATE settings SET value = '+39 06 1234567' WHERE key = 'office_phone';
UPDATE settings SET value = '+39 333 1234567' WHERE key = 'office_sms';
```

---

## 🔧 Fuso orario

Il file `netlify/functions/check-alarms.js` usa `offset = 2` (estate, CEST).
In inverno (CET) cambia in `offset = 1`.

> Per una soluzione automatica usa `new Date().toLocaleString('it-IT', {timeZone:'Europe/Rome'})`.
