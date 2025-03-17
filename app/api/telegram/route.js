import { format } from 'date-fns';

/**
 * Retorna a URL para buscar os eventos do Google Calendar com os filtros de data.
 */
function getCalendarUrl(apiKey, calendarId, timeMin, timeMax) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&orderBy=startTime&singleEvents=true`;
}

/**
 * Busca os eventos do Calendar usando os parâmetros de data.
 */
async function fetchCalendarEvents(apiKey, calendarId, timeMin, timeMax) {
  const url = getCalendarUrl(apiKey, calendarId, timeMin, timeMax);
  console.log('Fetching events from URL:', url);
  const res = await fetch(url);
  if (!res.ok) {
    const errorDetails = await res.text();
    throw new Error(`Erro ao buscar os eventos do Calendar: ${errorDetails}`);
  }
  const data = await res.json();
  return data.items;
}

/**
 * Separa os eventos do dia em passados e futuros.
 */
function separateEvents(events) {
  const now = new Date();
  const pastEvents = events.filter(event => {
    const start = event.start.dateTime || event.start.date;
    return new Date(start) < now;
  });
  const upcomingEvents = events.filter(event => {
    const start = event.start.dateTime || event.start.date;
    return new Date(start) >= now;
  });
  pastEvents.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
  upcomingEvents.sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date));
  return { pastEvents, upcomingEvents };
}

/**
 * Gera a mensagem formatada para um evento, incluindo link do Waze se houver localização.
 */
function generateMessage(event, statusEmoji) {
  const start = event.start.dateTime || event.start.date;
  const eventDate = new Date(start);
  const formattedTime = format(eventDate, 'HH:mm'); // Formata para "HH:mm"
  let message = `*Evento:* ${event.summary}\n*Horário:* ${formattedTime} ${statusEmoji}`;
  
  if (event.location) {
    const wazeLink = `https://waze.com/ul?q=${encodeURIComponent(event.location)}&navigate=yes`;
    message += `\n*Local:* [${event.location}](${wazeLink})`;
  }
  
  return message;
}

/**
 * Envia uma mensagem via Telegram utilizando a Bot API.
 */
async function sendTelegramMessage(botToken, chatId, message) {
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(telegramUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    })
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Erro ao enviar mensagem no Telegram: ${JSON.stringify(data)}`);
  }
}

export async function POST(request) {
  try {
    // Recupera as variáveis de ambiente
    const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
    const calendarId = process.env.CALENDAR_ID;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!apiKey || !calendarId || !botToken || !chatId) {
      throw new Error("Variáveis de ambiente não definidas corretamente.");
    }

    // Define o intervalo do dia atual
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const timeMin = today.toISOString();
    const timeMax = tomorrow.toISOString();

    // Busca os eventos do Google Calendar
    const events = await fetchCalendarEvents(apiKey, calendarId, timeMin, timeMax);
    
    // Se não houver eventos, envia uma mensagem única
    if (!events || events.length === 0) {
      await sendTelegramMessage(botToken, chatId, 'Nenhum evento encontrado para hoje.');
      return new Response(JSON.stringify({ message: 'Nenhum evento encontrado para hoje.' }), { status: 200 });
    }

    // Separa os eventos em passados e futuros
    const { pastEvents, upcomingEvents } = separateEvents(events);

    // Envia notificações para os eventos passados (usando 🟢 para indicar que já ocorreram)
    for (const event of pastEvents) {
      const message = generateMessage(event, '🟢');
      await sendTelegramMessage(botToken, chatId, message);
    }

    // Envia notificações para os eventos futuros (usando 🔴 para indicar que estão por vir)
    for (const event of upcomingEvents) {
      const message = generateMessage(event, '🔴');
      await sendTelegramMessage(botToken, chatId, message);
    }

    return new Response(JSON.stringify({ message: 'Mensagens enviadas com sucesso.' }), { status: 200 });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    return new Response(JSON.stringify({ message: 'Erro ao enviar mensagem', error: error.message }), { status: 500 });
  }
}
