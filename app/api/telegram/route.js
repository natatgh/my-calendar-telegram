import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';
import { startOfDay, set, format } from 'date-fns';

const timeZone = 'America/Sao_Paulo';

function getNotificationPeriod() {
  // Converte a data atual para o fuso horário de Brasília
  const now = utcToZonedTime(new Date(), timeZone);
  // Obtém o início do dia (para a data convertida)
  const today = startOfDay(now);

  let timeMin, timeMax, greeting;
  const currentHour = now.getHours();

  if (currentHour >= 7 && currentHour < 12) {
    // Período da manhã
    timeMin = set(today, { hours: 7 });
    timeMax = set(today, { hours: 12 });
    greeting = "Bom dia!";
  } else if (currentHour >= 12 && currentHour < 19) {
    // Período da tarde
    timeMin = set(today, { hours: 12 });
    timeMax = set(today, { hours: 19 });
    greeting = "Boa tarde!";
  } else {
    // Período da noite
    timeMin = set(today, { hours: 19 });
    // Para o período da noite, timeMax é às 07:00 do dia seguinte
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    timeMax = set(tomorrow, { hours: 7 });
    greeting = "Boa noite!";
  }

  // Converte os horários de Brasília para UTC para usar na API do Google Calendar
  const timeMinUtc = zonedTimeToUtc(timeMin, timeZone);
  const timeMaxUtc = zonedTimeToUtc(timeMax, timeZone);

  return { timeMin: timeMinUtc, timeMax: timeMaxUtc, greeting };
}

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
    const { timeMin, timeMax, greeting } = getNotificationPeriod();

    // Obtem as variáveis de ambiente para o token do bot e o chat_id
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      throw new Error("Variáveis de ambiente TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidas.");
    }

    // Cria uma mensagem de exemplo utilizando o período obtido
    const message = `${greeting}\nHorário Mínimo: ${timeMin.toISOString()}\nHorário Máximo: ${timeMax.toISOString()}`;

    // Envia a mensagem via Telegram
    await sendTelegramMessage(botToken, chatId, message);

    return new Response(
      JSON.stringify({
        message: 'Notificação enviada com sucesso!',
        greeting,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString()
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Erro no endpoint:", error);
    return new Response(
      JSON.stringify({
        message: 'Erro interno',
        error: error.message
      }),
      { status: 500 }
    );
  }
}
