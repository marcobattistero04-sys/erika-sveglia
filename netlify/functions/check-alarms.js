// netlify/functions/check-alarms.js
// Funzione schedulata: gira ogni minuto e attiva chiamate/SMS Twilio
// Richiede variabili d'ambiente in Netlify:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

const { schedule } = require('@netlify/functions');
const twilio = require('twilio');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const fromNumber  = process.env.TWILIO_FROM_NUMBER;

// Fetch helper per Supabase REST (senza SDK per ridurre dipendenze)
async function supabase(path, method = 'GET', body) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: method === 'PATCH' ? 'return=representation' : 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status}`);
  return res.json();
}

async function getSettings() {
  const rows = await supabase('settings?select=key,value');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function buildTwiML(driverName, alarmTime) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="it-IT" voice="Polly.Bianca">
    Buongiorno ${driverName}. Sono le ${alarmTime}.
    Questo è il promemoria del tuo servizio Erika Bus.
    Se hai ricevuto questo messaggio, il tuo turno sta iniziando.
  </Say>
  <Pause length="2"/>
  <Say language="it-IT" voice="Polly.Bianca">
    Ripeto: buongiorno ${driverName}. Il tuo servizio sta iniziando.
  </Say>
</Response>`;
}

function buildEscalationTwiML(driverName, alarmTime, driverPhone) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="it-IT" voice="Polly.Bianca">
    Attenzione ufficio Erika Bus.
    L'autista ${driverName}, in servizio alle ${alarmTime},
    non ha risposto alla sveglia.
    Numero autista: ${driverPhone.split('').join(' ')}.
    Si prega di verificare immediatamente.
  </Say>
  <Pause length="2"/>
  <Say language="it-IT" voice="Polly.Bianca">Ripeto: ${driverName} non ha risposto. Verificare subito.</Say>
</Response>`;
}

const handler = async () => {
  try {
    const now = new Date();
    // Ora italiana (UTC+1 o UTC+2) – adatta se necessario
    const offset = 2; // estate CEST; usa 1 per inverno CET
    const itNow = new Date(now.getTime() + offset * 3600 * 1000);
    const todayDate = itNow.toISOString().slice(0, 10);
    const nowTime   = itNow.toISOString().slice(11, 16); // HH:MM

    console.log(`[check-alarms] ${todayDate} ${nowTime}`);

    const settings = await getSettings();
    const officePhone = settings.office_phone;
    const officeSms   = settings.office_sms || officePhone;

    // ── 1. Nuove sveglie da attivare ────────────────────────────────────────
    const due = await supabase(
      `alarms?select=*,drivers(name,phone)&alarm_date=eq.${todayDate}&alarm_time=eq.${nowTime}:00&state=eq.pending&enabled=eq.true`
    );

    for (const alarm of due) {
      const driver = alarm.drivers;
      if (!driver) continue;
      console.log(`[RING] ${driver.name} @ ${alarm.alarm_time}`);

      // Aggiorna stato
      await supabase(`alarms?id=eq.${alarm.id}`, 'PATCH', {
        state: 'ringing',
        triggered_at: new Date().toISOString()
      });

      // Chiamata Twilio
      try {
        await twilioClient.calls.create({
          twiml: buildTwiML(driver.name, alarm.alarm_time.slice(0,5)),
          to: driver.phone,
          from: fromNumber
        });
      } catch(e) { console.error('Call error:', e.message); }

      // SMS di accompagnamento
      try {
        await twilioClient.messages.create({
          body: `⏰ ERIKA BUS – Sveglia ore ${alarm.alarm_time.slice(0,5)}${alarm.note ? ` · ${alarm.note}` : ''}. Buon servizio, ${driver.name}!`,
          to: driver.phone,
          from: fromNumber
        });
      } catch(e) { console.error('SMS error:', e.message); }
    }

    // ── 2. Escalation: autisti che non hanno risposto ───────────────────────
    const ringing = await supabase(
      `alarms?select=*,drivers(name,phone)&state=eq.ringing&alarm_date=eq.${todayDate}`
    );

    for (const alarm of ringing) {
      const driver = alarm.drivers;
      if (!driver || !alarm.triggered_at) continue;
      const triggeredMs = new Date(alarm.triggered_at).getTime();
      const elapsedMin  = (now.getTime() - triggeredMs) / 60000;
      const escMin      = alarm.escalation_minutes || 15;

      if (elapsedMin >= escMin) {
        console.log(`[ESCALATION] ${driver.name} → ufficio dopo ${Math.round(elapsedMin)} min`);

        await supabase(`alarms?id=eq.${alarm.id}`, 'PATCH', {
          state: 'escalating',
          escalated_at: new Date().toISOString()
        });

        // Chiamata all'ufficio
        try {
          await twilioClient.calls.create({
            twiml: buildEscalationTwiML(driver.name, alarm.alarm_time.slice(0,5), driver.phone),
            to: officePhone,
            from: fromNumber
          });
        } catch(e) { console.error('Escalation call error:', e.message); }

        // SMS agli operatori
        try {
          await twilioClient.messages.create({
            body: `🚨 ERIKA BUS – ${driver.name} non risponde alla sveglia delle ${alarm.alarm_time.slice(0,5)}. Tel: ${driver.phone}`,
            to: officeSms,
            from: fromNumber
          });
        } catch(e) { console.error('Escalation SMS error:', e.message); }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, checked: due.length }) };
  } catch(err) {
    console.error('[check-alarms] FATAL:', err);
    return { statusCode: 500, body: err.message };
  }
};

exports.handler = schedule('* * * * *', handler);
