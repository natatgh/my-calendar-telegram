// Importa funções necessárias da biblioteca date-fns-tz
import { utcToZonedTime, zonedTimeToUtc, startOfDay, set } from 'date-fns-tz';
import { format } from 'date-fns';

const timeZone = 'America/Sao_Paulo';

function getNotificationPeriod() {
  // Converte a data atual para o fuso horário de Brasília
  const now = utcToZonedTime(new Date(), timeZone);
  // Obtém o início do dia no fuso de Brasília
  const today = startOfDay(now, { timeZone });

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
    // Primeiro adiciona um dia ao início do dia de Brasília...
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    timeMax = set(tomorrow, { hours: 7 });
    greeting = "Boa noite!";
  }

  // Converte os horários de Brasília para UTC para utilizar na API do Google Calendar
  const timeMinUtc = zonedTimeToUtc(timeMin, timeZone);
  const timeMaxUtc = zonedTimeToUtc(timeMax, timeZone);

  return { timeMin: timeMinUtc, timeMax: timeMaxUtc, greeting };
}
