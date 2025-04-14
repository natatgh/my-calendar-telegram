import { format } from 'date-fns';

/**
 * Retorna o período de notificação baseado no horário atual.
 * Define:
 * - Período da manhã: 07:00 às 12:00
 * - Período da tarde: 12:00 às 19:00
 * - Período da noite: 19:00 às 07:00 do dia seguinte
 */
function getNotificationPeriod() {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  let timeMin, timeMax, greeting, periodDescription;
  const currentHour = now.getHours();

  if (currentHour >= 7 && currentHour < 12) {
    // Período da manhã
    timeMin = new Date(today);
    timeMin.setHours(7);
    timeMax = new Date(today);
    timeMax.setHours(12);
    greeting = "Bom dia!";
    periodDescription = "manhã (07:00 - 12:00)";
  } else if (currentHour >= 12 && currentHour < 19) {
    // Período da tarde
    timeMin = new Date(today);
    timeMin.setHours(12);
    timeMax = new Date(today);
    timeMax.setHours(19);
    greeting = "Boa tarde!";
    periodDescription = "tarde (12:00 - 19:00)";
  } else {
    // Período da noite
    timeMin = new Date(today);
    timeMin.setHours(19);
    timeMax = new Date(today);
    timeMax.setDate(timeMax.getDate() + 1);
    timeMax.setHours(7);
    greeting = "Boa noite!";
    periodDescription = "noite (19:00 - 07:00)";
  }
  return { timeMin, timeMax, greeting, periodDescription };
}

/**
 * Monta a URL para buscar eventos do Calendar usando os parâmetros de data.
 */
function getCalendarUrl(apiKey, calendarId, timeMin, timeMax) {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId
  )}/events?key=${apiKey}&timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&orderBy=startTime&singleEvents=true`;
}

/**
 * Busca os eventos do Google Calendar no intervalo definido.
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
 * Gera a mensagem para um evento, incluindo link do Waze se houver localização.
 */
function generateMessage(event, statusEmoji) {
  const start = event.start.dateTime || event.start.date;
  const eventDate = new Date(start);
  const formattedTime = format(eventDate, 'HH:mm');

  let message = `**${event.summary}**\n`;
  message += `*Horário:* ${formattedTime} ${statusEmoji}\n`;

  if (event.location) {
    const wazeLink = `https://waze.com/ul?q=${encodeURIComponent(
      event.location
    )}&navigate=yes`;
    message += `*Local:* [${event.location}](${wazeLink})\n`;
  }
  return message;
}

/**
 * Envia mensagem via Telegram.
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

/**
 * Handler para requisições POST.
 */
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

    // Define o período de notificação e prepara uma descrição amigável
    const { timeMin, timeMax, greeting, periodDescription } = getNotificationPeriod();
    console.log(
      `Período: ${timeMin.toISOString()} até ${timeMax.toISOString()} - ${periodDescription}`
    );

    // Busca os eventos no intervalo
    const events = await fetchCalendarEvents(apiKey, calendarId, timeMin, timeMax);
    let notificationsSent = 0;
    let details = [];

    if (!events || events.length === 0) {
      // Mensagem padrão se não houver eventos
      const message = `${greeting} Nenhum evento agendado para o período ${periodDescription}.`;
      await sendTelegramMessage(botToken, chatId, message);
      notificationsSent++;
      details.push({ message });
    } else {
      // Envia uma mensagem de cabeçalho informando o período e listando os eventos
      const headerMessage = `${greeting} Detectamos que o período atual é de ${periodDescription}. Estes são seus eventos agendados para esse período:`;
      await sendTelegramMessage(botToken, chatId, headerMessage);
      notificationsSent++;
      details.push({ message: headerMessage });

      // Para cada evento, envia a notificação detalhada
      const now = new Date();
      for (const event of events) {
        const start = event.start.dateTime || event.start.date;
        const eventDate = new Date(start);
        const statusEmoji = eventDate < now ? "🟢" : "🔴";
        const message = generateMessage(event, statusEmoji);
        await sendTelegramMessage(botToken, chatId, message);
        notificationsSent++;
        details.push({ message, eventSummary: event.summary });
      }
    }

    // Responde com um JSON detalhado para depuração e confirmação
    const responseData = {
      message: 'Notificações enviadas com sucesso.',
      period: {
        greeting,
        description: periodDescription,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString()
      },
      notificationsSent,
      events: events || [],
      details
    };

    return new Response(JSON.stringify(responseData), { status: 200 });
  } catch (error) {
    console.error('Erro ao enviar notificações:', error);
    return new Response(
      JSON.stringify({ message: 'Erro ao enviar notificações', error: error.message }),
      { status: 500 }
    );
  }
}
